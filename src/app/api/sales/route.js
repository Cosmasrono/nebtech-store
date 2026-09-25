import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateReceiptNumber } from "@/lib/numbers";
import { deductFefo, mainBranchId } from "@/lib/inventory";
import { normalizePhone } from "@/lib/mpesa";
import { debtAmounts, describeItems } from "@/lib/loans";
import { priceCart, round2 } from "@/lib/discounts";

const PAYMENT_METHODS = ["cash", "mpesa", "card", "credit"];

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = {
    // Cashiers only see their own sales unless they can view_all_sales
    ...(!userCan(user, "view_all_sales") && { cashierId: user.id }),
    ...(from || to
      ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to + "T23:59:59") }) } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { cashier: { select: { id: true, name: true } }, customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.sale.count({ where }),
  ]);
  return Response.json({ data: items, total, page, perPage });
}

export async function POST(req) {
  const { user, error } = await requireAuth("process_sales");
  if (error) return error;
  const data = await req.json();

  if (!Array.isArray(data.items) || data.items.length === 0) {
    return Response.json({ message: "At least one sale item is required." }, { status: 422 });
  }

  // Offline POS sales carry a client-generated id; if a sync retry re-sends one
  // that already landed, return the existing sale instead of recording it twice.
  const clientId = typeof data.clientId === "string" && data.clientId.length <= 64 ? data.clientId : null;
  if (clientId) {
    const existing = await prisma.sale.findFirst({
      where: { clientId, cashierId: user.id },
      include: { items: { include: { product: true } } },
    });
    if (existing) return Response.json({ data: existing, duplicate: true }, { status: 200 });
  }

  // Keep the real time an offline sale happened (bounded so it can't be backdated arbitrarily).
  let createdAt;
  if (clientId && data.offlineCreatedAt) {
    const t = new Date(data.offlineCreatedAt);
    const age = Date.now() - t.getTime();
    if (Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 60 * 60 * 1000) createdAt = t;
  }

  // Prices and totals are always recomputed from the catalog — never trusted from the client.
  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const rawItems = [];
  for (const raw of data.items) {
    const product = productById.get(raw.productId);
    if (!product) {
      return Response.json({ message: "Unknown product in sale items." }, { status: 422 });
    }
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return Response.json({ message: `Invalid quantity for ${product.name}.` }, { status: 422 });
    }
    rawItems.push({ productId: product.id, quantity, unitPrice: product.sellingPrice, discountPerItem: raw.discountPerItem });
  }

  let promo = null;
  let promotionId = null;
  if (data.promotionId) {
    promo = await prisma.promotion.findUnique({ where: { id: data.promotionId } });
    const now = new Date();
    const valid = promo && promo.isActive && (!promo.startDate || promo.startDate <= now) && (!promo.endDate || promo.endDate >= now);
    if (!valid) {
      return Response.json({ message: "Promotion is not valid for this sale." }, { status: 422 });
    }
    promotionId = promo.id;
  }

  // Discount on the whole sale typed in at the POS: { type: "amount" | "percent", value }
  const manual = data.saleDiscount && Number(data.saleDiscount.value) > 0
    ? { type: data.saleDiscount.type === "percent" ? "percent" : "amount", value: Number(data.saleDiscount.value) }
    : null;
  if (manual && manual.type === "percent" && manual.value > 100) {
    return Response.json({ message: "A discount can't be more than 100%." }, { status: 422 });
  }

  const priced = priceCart({ items: rawItems, promo, manual });
  if (promo && priced.promoDiscount === 0 && priced.gross > 0) {
    return Response.json({ message: `This promotion needs a minimum spend of KSh ${promo.minSpend.toLocaleString()}.` }, { status: 422 });
  }

  // Only people allowed to give discounts may lower prices by hand.
  const handDiscount = round2(priced.itemDiscount + priced.manualDiscount);
  if (handDiscount > 0 && !userCan(user, "give_discounts")) {
    return Response.json({ message: "You don't have permission to give discounts. Ask a manager." }, { status: 403 });
  }
  const discountReason = handDiscount > 0 && data.discountReason ? String(data.discountReason).trim().slice(0, 200) : "";

  const items = priced.lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal, // after the item discount
    discountPerItem: l.discountPerItem,
  }));
  const subtotal = priced.gross;
  const discountAmount = priced.discountAmount;

  const tradeIns = Array.isArray(data.tradeIns) ? data.tradeIns : [];
  for (const t of tradeIns) {
    if (!t.modelName || !Number.isFinite(Number(t.value)) || Number(t.value) < 0) {
      return Response.json({ message: "Invalid trade-in entry." }, { status: 422 });
    }
  }
  const tradeInAmount = tradeIns.reduce((s, t) => s + Number(t.value), 0);

  const taxAmount = Math.max(0, Number(data.taxAmount) || 0);
  const totalAmount = round2(Math.max(0, subtotal + taxAmount - discountAmount - tradeInAmount));
  const cashPaid = Math.max(0, Number(data.cashPaid) || 0);
  const mpesaPaid = Math.max(0, Number(data.mpesaPaid) || 0);
  const cardPaid = Math.max(0, Number(data.cardPaid) || 0);
  const changeAmount = Math.min(cashPaid, Math.max(0, Number(data.changeAmount) || 0));

  // "debt" is what the POS shows; it's stored as the existing "credit" payment method.
  const paymentMethod = ["debt", "loan"].includes(data.primaryPaymentMethod) ? "credit" : data.primaryPaymentMethod || "cash";
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return Response.json({ message: "Unknown payment method." }, { status: 422 });
  }
  const isLoan = paymentMethod === "credit";

  // Live (not offline) sales must be fully paid unless they're recorded as a debt.
  // Offline sales already happened at the till, so they're recorded even if prices moved since.
  const isOfflineSale = Boolean(clientId && data.offlineCreatedAt);
  if (!isLoan && !isOfflineSale && cashPaid - changeAmount + mpesaPaid + cardPaid < totalAmount - 0.01) {
    return Response.json({ message: `Payment is short: total is KSh ${totalAmount.toLocaleString()}.` }, { status: 422 });
  }

  // M-Pesa sales must point at a confirmed payment that hasn't been used for another sale.
  let mpesaTxnId = null;
  if (mpesaPaid > 0) {
    mpesaTxnId = typeof data.mpesaTransactionId === "string" ? data.mpesaTransactionId : null;
    const txn = mpesaTxnId ? await prisma.mpesaTransaction.findUnique({ where: { id: mpesaTxnId } }).catch(() => null) : null;
    if (!txn || txn.status !== "confirmed") {
      return Response.json({ message: "The M-Pesa payment isn't confirmed yet." }, { status: 422 });
    }
    if (txn.saleId) {
      return Response.json({ message: "This M-Pesa payment has already been used for another sale." }, { status: 422 });
    }
    if (txn.amount + 0.01 < mpesaPaid) {
      return Response.json({ message: `The M-Pesa payment (KSh ${txn.amount.toLocaleString()}) is less than the amount recorded.` }, { status: 422 });
    }
  }

  // Sale on debt: the customer owes exactly the sale total (no interest).
  const loanTotals = isLoan ? debtAmounts(totalAmount) : null;

  // Resolve branch: user's branch, else main branch
  const branchId = user.branchId || (await mainBranchId());

  try {
    // Validation + lookups run before the transaction so it stays short
    // (each query is a network round-trip; the tx must fit in its timeout).
    if (branchId) {
      // One query for the whole cart instead of two per item.
      const now = new Date();
      const cartIds = items.map((i) => i.productId);
      const expiredRows = await prisma.productBatch.groupBy({
        by: ["productId"],
        where: { productId: { in: cartIds }, branchId, expiryDate: { lt: now }, quantity: { gt: 0 } },
        _sum: { quantity: true },
      });
      const expiredById = new Map(expiredRows.map((r) => [r.productId, r._sum.quantity || 0]));
      const withExpired = cartIds.filter((id) => expiredById.get(id) > 0);
      if (withExpired.length) {
        const sellableRows = await prisma.productBatch.groupBy({
          by: ["productId"],
          where: {
            productId: { in: withExpired },
            branchId,
            quantity: { gt: 0 },
            OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
          },
          _sum: { quantity: true },
        });
        const sellableById = new Map(sellableRows.map((r) => [r.productId, r._sum.quantity || 0]));
        for (const item of items) {
          const expiredQty = expiredById.get(item.productId) || 0;
          if (!expiredQty) continue;
          const sellable = sellableById.get(item.productId) || 0;
          if (item.quantity > sellable) {
            const p = productById.get(item.productId);
            throw new Error(
              `Cannot sell ${item.quantity} × ${p?.name || "item"}: only ${sellable} non-expired unit(s) available (${expiredQty} expired and blocked from sale).`
            );
          }
        }
      }
    }

    // Active shift (optional)
    const shift = await prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } });

    // Auto-save the customer when a phone was captured (e.g. M-Pesa prompt)
    let customerId = data.customerId || null;
    if (!customerId && data.customerPhone) {
      try {
        const phone = normalizePhone(data.customerPhone);
        const customer = await prisma.customer.upsert({
          where: { phone },
          update: {},
          create: { name: data.customerName || `Customer ${phone}`, phone },
        });
        customerId = customer.id;
      } catch {
        // A failed customer save must not block the sale
      }
    }

    if (isLoan) {
      if (!customerId) {
        return Response.json({ message: "Choose the customer who will owe this amount." }, { status: 422 });
      }
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        return Response.json({ message: "Customer not found." }, { status: 422 });
      }
      // Customers not yet approved to buy on debt need someone allowed to manage debts (a manager).
      if (!customer.canBuyOnCredit && !userCan(user, "manage_loans")) {
        return Response.json({ message: `${customer.name} isn't approved to buy on debt yet. Ask a manager to complete this sale.` }, { status: 422 });
      }
      const owedAfter = (customer.currentCreditBalance || 0) + loanTotals.totalAmount;
      if (customer.creditLimit > 0 && owedAfter > customer.creditLimit) {
        const available = Math.max(0, customer.creditLimit - customer.currentCreditBalance);
        return Response.json({
          message: `Debt limit reached. ${customer.name} can owe up to KSh ${available.toLocaleString()} more, but this sale is KSh ${loanTotals.totalAmount.toLocaleString()}.`
        }, { status: 422 });
      }
      if (data.creditDueDate) {
        const due = new Date(data.creditDueDate);
        if (Number.isNaN(due.getTime()) || due < new Date(new Date().toDateString())) {
          return Response.json({ message: "The date to pay by can't be in the past." }, { status: 422 });
        }
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          receiptNumber: generateReceiptNumber(),
          cashierId: user.id,
          branchId,
          customerId,
          promotionId,
          status: "completed",
          subtotal,
          taxAmount,
          discountAmount,
          tradeInAmount,
          totalAmount,
          primaryPaymentMethod: paymentMethod,
          cashPaid,
          mpesaPaid,
          cardPaid,
          changeAmount,
          notes: [data.notes, handDiscount > 0 && `Discount KSh ${handDiscount.toLocaleString()} by ${user.name}${discountReason ? `: ${discountReason}` : ""}`]
            .filter(Boolean).join(" | ") || null,
          shiftId: data.shiftId || shift?.id || null,
          clientId,
          ...(createdAt && { createdAt }),
        },
      });

      await tx.saleItem.createMany({
        data: items.map((item) => ({
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          discountPerItem: item.discountPerItem,
        })),
      });

      for (const item of items) {
        // Branch stock + FEFO batch drawdown
        if (branchId) {
          await tx.productBranchStock.updateMany({
            where: { productId: item.productId, branchId },
            data: { quantityInStock: { decrement: item.quantity } },
          });
          await deductFefo(tx, item.productId, branchId, item.quantity);
        }

        // Total stock
        await tx.product.update({
          where: { id: item.productId },
          data: { quantityInStock: { decrement: item.quantity } },
        });
      }

      await tx.stockMovement.createMany({
        data: items.map((item) => ({
          productId: item.productId,
          branchId,
          type: "sale",
          quantity: -Number(item.quantity),
          notes: `Sale #${sale.receiptNumber}`,
          userId: user.id,
        })),
      });

      // Trade-ins → create trade-in product + record
      if (tradeIns.length) {
        let tradeCat = await tx.category.findUnique({ where: { name: "Trade-in" } });
        if (!tradeCat) tradeCat = await tx.category.create({ data: { name: "Trade-in", description: "Items received via trade-in" } });

        for (const t of tradeIns) {
          const tradeProduct = await tx.product.create({
            data: {
              name: `${t.modelName} (Trade-in)`,
              sku: `TI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              costPrice: Number(t.value),
              sellingPrice: Number(t.value),
              quantityInStock: 1,
              totalCost: Number(t.value),
              categoryId: tradeCat.id,
              description: t.condition ? `Condition: ${t.condition}` : null,
            },
          });
          await tx.tradeIn.create({
            data: {
              saleId: sale.id,
              modelName: t.modelName,
              imeiSerial: t.imeiSerial || null,
              value: Number(t.value),
              condition: t.condition || null,
              productId: tradeProduct.id,
            },
          });
        }
      }

      // Update shift running totals
      const activeShiftId = data.shiftId || shift?.id;
      if (activeShiftId) {
        await tx.shift.update({
          where: { id: activeShiftId },
          data: {
            totalCashSales: { increment: cashPaid - changeAmount },
            totalMpesaSales: { increment: mpesaPaid },
            totalCardSales: { increment: cardPaid },
          },
        });
      }

      // Link the confirmed M-Pesa payment to this sale. The saleId: null condition makes
      // sure two sales can't both claim the same payment.
      if (mpesaTxnId) {
        const linked = await tx.mpesaTransaction.updateMany({
          where: { id: mpesaTxnId, saleId: null, status: "confirmed" },
          data: { saleId: sale.id },
        });
        if (linked.count !== 1) throw new Error("This M-Pesa payment has already been used for another sale.");
      }

      // Sale on debt: the debt records exactly which products the customer took.
      if (isLoan && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { currentCreditBalance: { increment: loanTotals.totalAmount } },
        });

        const dueDate = data.creditDueDate
          ? new Date(data.creditDueDate)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const loanItems = items.map((it) => {
          const p = productById.get(it.productId);
          return {
            productId: it.productId,
            name: p?.name || "Item",
            sku: p?.sku || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: it.lineTotal,
          };
        });

        await tx.loan.create({
          data: {
            customerId,
            userId: user.id,
            saleId: sale.id,
            loanNumber: `DBT-${sale.receiptNumber.replace(/^RCP-/, "")}`,
            productDescription: describeItems(loanItems),
            items: loanItems,
            ...loanTotals,
            loanDate: new Date(),
            dueDate,
            notes: data.loanNotes ? String(data.loanNotes).slice(0, 500) : `POS sale #${sale.receiptNumber}`,
          },
        });
      }

      return sale;
    }, { maxWait: 10000, timeout: 30000 });

    await audit({ userId: user.id, event: "created", type: "Sale", auditableId: sale.id, newValues: { receiptNumber: sale.receiptNumber, totalAmount: sale.totalAmount, ...(handDiscount > 0 && { discount: handDiscount, discountReason }) }, req });
    const full = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: { include: { product: true } } } });
    return Response.json({ data: full }, { status: 201 });
  } catch (e) {
    return Response.json({ message: e.message || "Sale failed." }, { status: 422 });
  }
}
