import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateReceiptNumber } from "@/lib/numbers";
import { expiredQuantity, sellableQuantity, deductFefo, mainBranchId } from "@/lib/inventory";

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

  // Resolve branch: user's branch, else main branch
  const branchId = user.branchId || (await mainBranchId());

  try {
    // Validation + lookups run before the transaction so it stays short
    // (each query is a network round-trip; the tx must fit in its timeout).
    if (branchId) {
      for (const item of data.items) {
        const expiredQty = await expiredQuantity(prisma, item.productId, branchId);
        if (expiredQty > 0) {
          const sellable = await sellableQuantity(prisma, item.productId, branchId);
          if (item.quantity > sellable) {
            const p = await prisma.product.findUnique({ where: { id: item.productId } });
            throw new Error(
              `Cannot sell ${item.quantity} × ${p?.name || "item"}: only ${sellable} non-expired unit(s) available (${expiredQty} expired and blocked from sale).`
            );
          }
        }
      }
    }

    // Active shift (optional)
    const shift = await prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } });

    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          receiptNumber: generateReceiptNumber(),
          cashierId: user.id,
          branchId,
          customerId: data.customerId || null,
          promotionId: data.promotionId || null,
          status: "completed",
          subtotal: Number(data.subtotal),
          taxAmount: Number(data.taxAmount || 0),
          discountAmount: Number(data.discountAmount || 0),
          tradeInAmount: Number(data.tradeInAmount || 0),
          totalAmount: Number(data.totalAmount),
          primaryPaymentMethod: data.primaryPaymentMethod || "cash",
          cashPaid: Number(data.cashPaid || 0),
          mpesaPaid: Number(data.mpesaPaid || 0),
          cardPaid: Number(data.cardPaid || 0),
          changeAmount: Number(data.changeAmount || 0),
          notes: data.notes || null,
          shiftId: data.shiftId || shift?.id || null,
        },
      });

      await tx.saleItem.createMany({
        data: data.items.map((item) => ({
          saleId: sale.id,
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
          discountPerItem: Number(item.discountPerItem || 0),
        })),
      });

      for (const item of data.items) {
        // Branch stock + FEFO batch drawdown
        if (branchId) {
          await tx.productBranchStock.updateMany({
            where: { productId: item.productId, branchId },
            data: { quantityInStock: { decrement: Number(item.quantity) } },
          });
          await deductFefo(tx, item.productId, branchId, Number(item.quantity));
        }

        // Total stock
        await tx.product.update({
          where: { id: item.productId },
          data: { quantityInStock: { decrement: Number(item.quantity) } },
        });
      }

      await tx.stockMovement.createMany({
        data: data.items.map((item) => ({
          productId: item.productId,
          branchId,
          type: "sale",
          quantity: -Number(item.quantity),
          notes: `Sale #${sale.receiptNumber}`,
          userId: user.id,
        })),
      });

      // Trade-ins → create trade-in product + record
      if (Array.isArray(data.tradeIns) && data.tradeIns.length) {
        let tradeCat = await tx.category.findUnique({ where: { name: "Trade-in" } });
        if (!tradeCat) tradeCat = await tx.category.create({ data: { name: "Trade-in", description: "Items received via trade-in" } });

        for (const t of data.tradeIns) {
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
            totalCashSales: { increment: Number(data.cashPaid || 0) - Number(data.changeAmount || 0) },
            totalMpesaSales: { increment: Number(data.mpesaPaid || 0) },
            totalCardSales: { increment: Number(data.cardPaid || 0) },
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
