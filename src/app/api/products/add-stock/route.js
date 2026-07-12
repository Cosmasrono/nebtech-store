import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Port of ProductController@addStock — receive stock into a branch (with optional batch/expiry)
export async function POST(req) {
  const { user, error } = await requireAuth("receive_stock");
  if (error) return error;
  const { productId, branchId, quantity, costPrice, batchNumber, expiryDate, notes } = await req.json();
  if (!productId || !quantity) return Response.json({ message: "productId and quantity are required." }, { status: 422 });

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return Response.json({ message: "Product not found." }, { status: 404 });

  const branch = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId } })
    : await prisma.branch.findFirst({ where: { isMain: true } });

  const qty = Number(quantity);
  await prisma.product.update({
    where: { id: productId },
    data: {
      quantityInStock: { increment: qty },
      ...(costPrice != null && { costPrice: Number(costPrice) }),
    },
  });

  if (branch) {
    await prisma.productBranchStock.upsert({
      where: { productId_branchId: { productId, branchId: branch.id } },
      update: { quantityInStock: { increment: qty } },
      create: { productId, branchId: branch.id, quantityInStock: qty },
    });
    await prisma.productBatch.create({
      data: {
        productId,
        branchId: branch.id,
        batchNumber: batchNumber || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        quantity: qty,
        costPrice: costPrice != null ? Number(costPrice) : product.costPrice,
        receivedAt: new Date(),
      },
    });
  }

  await prisma.stockMovement.create({
    data: { productId, branchId: branch?.id, type: "purchase", quantity: qty, notes: notes || "Stock received", userId: user.id },
  });
  await audit({ userId: user.id, event: "stock_added", type: "Product", auditableId: productId, newValues: { qty, branchId: branch?.id }, req });
  return Response.json({ message: "Stock added." });
}
