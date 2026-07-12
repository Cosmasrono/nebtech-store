// Inventory helpers — ports of ProductBatch::deductFefo / sellableQuantity
import prisma from "./prisma";

export async function expiredQuantity(tx, productId, branchId) {
  const agg = await tx.productBatch.aggregate({
    where: { productId, branchId, expiryDate: { lt: new Date() }, quantity: { gt: 0 } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity || 0;
}

export async function sellableQuantity(tx, productId, branchId) {
  const agg = await tx.productBatch.aggregate({
    where: {
      productId,
      branchId,
      quantity: { gt: 0 },
      OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
    },
    _sum: { quantity: true },
  });
  return agg._sum.quantity || 0;
}

// Draw stock down from batches earliest-expiry-first (FEFO)
export async function deductFefo(tx, productId, branchId, quantity) {
  let remaining = quantity;
  const batches = await tx.productBatch.findMany({
    where: {
      productId,
      branchId,
      quantity: { gt: 0 },
      OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
    },
    orderBy: [{ expiryDate: "asc" }],
  });
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    await tx.productBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: take } },
    });
    remaining -= take;
  }
  return quantity - remaining;
}

export async function mainBranchId(tx = prisma) {
  const main = await tx.branch.findFirst({ where: { isMain: true } });
  return main?.id || null;
}
