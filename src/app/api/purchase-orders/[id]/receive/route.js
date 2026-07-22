import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// Port of PurchaseOrderController@receive — receive items into stock
export async function POST(req, { params }) {
  const { user, error } = await requireAuth("receive_stock");
  if (error) return error;
  const { id } = await params;
  const { items = [], branchId } = await req.json(); // [{itemId, quantityReceived, quantityDamaged, batchNumber, expiryDate}]

  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return Response.json({ message: "Not found." }, { status: 404 });

  // If the PO carries allocations, ignore the passed branchId and split across them.
  // Otherwise keep the single-branch fallback: caller's branchId, else main.
  const allocs = Array.isArray(order.allocations) && order.allocations.length ? order.allocations : null;
  const fallbackBranch = allocs
    ? null
    : (branchId
        ? await prisma.branch.findUnique({ where: { id: branchId } })
        : await prisma.branch.findFirst({ where: { isMain: true } }));

  // Split an integer `total` across branches by percentage. Last branch soaks up
  // any rounding remainder so per-branch qtys always sum back to `total`.
  function splitByAllocations(total) {
    const out = [];
    let assigned = 0;
    for (let i = 0; i < allocs.length; i++) {
      const isLast = i === allocs.length - 1;
      const qty = isLast ? total - assigned : Math.floor((total * allocs[i].percentage) / 100);
      assigned += qty;
      if (qty > 0) out.push({ branchId: allocs[i].branchId, quantity: qty });
    }
    return out;
  }

  await prisma.$transaction(async (tx) => {
    for (const r of items) {
      const item = order.items.find((i) => i.id === r.itemId);
      if (!item) continue;
      const good = Number(r.quantityReceived || 0);
      const damaged = Number(r.quantityDamaged || 0);

      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: { increment: good }, quantityDamaged: { increment: damaged } },
      });
      if (good > 0) {
        await tx.product.update({ where: { id: item.productId }, data: { quantityInStock: { increment: good } } });

        const splits = allocs
          ? splitByAllocations(good)
          : (fallbackBranch ? [{ branchId: fallbackBranch.id, quantity: good }] : []);

        for (const s of splits) {
          await tx.productBranchStock.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: s.branchId } },
            update: { quantityInStock: { increment: s.quantity } },
            create: { productId: item.productId, branchId: s.branchId, quantityInStock: s.quantity },
          });
          await tx.productBatch.create({
            data: {
              productId: item.productId,
              branchId: s.branchId,
              batchNumber: r.batchNumber || null,
              expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
              quantity: s.quantity,
              costPrice: item.unitCost,
              receivedAt: new Date(),
            },
          });
          await tx.stockMovement.create({
            data: { productId: item.productId, branchId: s.branchId, type: "purchase", quantity: s.quantity, notes: `PO ${order.poNumber}`, userId: user.id },
          });
        }
      }
    }

    // Recompute status
    const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const fullyReceived = fresh.every((i) => i.quantityReceived >= i.quantityOrdered);
    const anyReceived = fresh.some((i) => i.quantityReceived > 0);
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: fullyReceived ? "received" : anyReceived ? "partial" : order.status,
        receivedDate: fullyReceived ? new Date() : order.receivedDate,
        receivedById: user.id,
      },
    });
  }, { maxWait: 10000, timeout: 30000 });

  return Response.json({ message: "Stock received." });
}
