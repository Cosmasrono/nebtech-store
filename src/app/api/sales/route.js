import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateReceiptNumber } from "@/lib/numbers";
import { expiredQuantity, sellableQuantity, deductFefo, mainBranchId } from "@/lib/inventory";
import { normalizePhone } from "@/lib/mpesa";

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

  // Prices and totals are always recomputed from the catalog — never trusted from the client.
  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = [];
  for (const raw of data.items) {
    const product = productById.get(raw.productId);
    if (!product) {
      return Response.json({ message: "Unknown product in sale items." }, { status: 422 });
    }
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return Response.json({ message: `Invalid quantity for ${product.name}.` }, { status: 422 });
    }
    const unitPrice = product.sellingPrice;
    items.push({
      productId: product.id,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      discountPerItem: Math.min(unitPrice, Math.max(0, Number(raw.discountPerItem) || 0)),
    });
  }

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);

  let discountAmount = 0;
  let promotionId = null;
  if (data.promotionId) {
    const promo = await prisma.promotion.findUnique({ where: { id: data.promotionId } });
    const now = new Date();
    const valid =
      promo &&
      promo.isActive &&
      (!promo.startDate || promo.startDate <= now) &&
      (!promo.endDate || promo.endDate >= now) &&
      subtotal >= promo.minSpend;
    if (!valid) {
      return Response.json({ message: "Promotion is not valid for this sale." }, { status: 422 });
    }
    promotionId = promo.id;
    discountAmount = promo.type === "percentage" ? (subtotal * promo.value) / 100 : Math.min(promo.value, subtotal);
  }

  const tradeIns = Array.isArray(data.tradeIns) ? data.tradeIns : [];
  for (const t of tradeIns) {
    if (!t.modelName || !Number.isFinite(Number(t.value)) || Number(t.value) < 0) {
      return Response.json({ message: "Invalid trade-in entry." }, { status: 422 });
    }
  }
  const tradeInAmount = tradeIns.reduce((s, t) => s + Number(t.value), 0);

  const taxAmount = Math.max(0, Number(data.taxAmount) || 0);
  const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount - tradeInAmount);
  const cashPaid = Math.max(0, Number(data.cashPaid) || 0);
  const mpesaPaid = Math.max(0, Number(data.mpesaPaid) || 0);
  const cardPaid = Math.max(0, Number(data.cardPaid) || 0);
  const changeAmount = Math.min(cashPaid, Math.max(0, Number(data.changeAmount) || 0));

  // Resolve branch: user's branch, else main branch
  const branchId = user.branchId || (await mainBranchId());

  try {
    // Validation + lookups run before the transaction so it stays short
    // (each query is a network round-trip; the tx must fit in its timeout).
    if (branchId) {
      for (const item of items) {
        const expiredQty = await expiredQuantity(prisma, item.productId, branchId);
        if (expiredQty > 0) {
          const sellable = await sellableQuantity(prisma, item.productId, branchId);
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
          primaryPaymentMethod: data.primaryPaymentMethod || "cash",
          cashPaid,
          mpesaPaid,
          cardPaid,
          changeAmount,
          notes: data.notes || null,
          shiftId: data.shiftId || shift?.id || null,
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

      return sale;
    }, { maxWait: 10000, timeout: 30000 });

    await audit({ userId: user.id, event: "created", type: "Sale", auditableId: sale.id, newValues: { receiptNumber: sale.receiptNumber, totalAmount: sale.totalAmount }, req });
    const full = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: { include: { product: true } } } });
    return Response.json({ data: full }, { status: 201 });
  } catch (e) {
    return Response.json({ message: e.message || "Sale failed." }, { status: 422 });
  }
}
