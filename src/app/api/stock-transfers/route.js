import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth("view_inventory");
  if (error) return error;
  const movements = await prisma.stockMovement.findMany({
    where: { type: "transfer" },
    include: { product: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const byId = Object.fromEntries(branches.map((b) => [b.id, b]));
  const data = movements.map((m) => ({
    ...m,
    fromBranch: m.fromBranchId ? byId[m.fromBranchId] || null : null,
    toBranch: m.branchId ? byId[m.branchId] || null : null,
  }));
  return Response.json({ data });
}

// Transfer stock between branches (port of StockTransferController@store)
export async function POST(req) {
  const { user, error } = await requireAuth("adjust_stock");
  if (error) return error;
  const { productId, fromBranchId, toBranchId, quantity, notes } = await req.json();
  if (!productId || !fromBranchId || !toBranchId || !quantity) {
    return Response.json({ message: "productId, fromBranchId, toBranchId and quantity are required." }, { status: 422 });
  }
  if (fromBranchId === toBranchId) return Response.json({ message: "Branches must differ." }, { status: 422 });
  const qty = Number(quantity);

  try {
    await prisma.$transaction(async (tx) => {
      const source = await tx.productBranchStock.findUnique({
        where: { productId_branchId: { productId, branchId: fromBranchId } },
      });
      if (!source || source.quantityInStock < qty) throw new Error("Insufficient stock at source branch.");

      await tx.productBranchStock.update({
        where: { id: source.id },
        data: { quantityInStock: { decrement: qty } },
      });
      await tx.productBranchStock.upsert({
        where: { productId_branchId: { productId, branchId: toBranchId } },
        update: { quantityInStock: { increment: qty } },
        create: { productId, branchId: toBranchId, quantityInStock: qty },
      });
      await tx.stockMovement.create({
        data: { productId, branchId: toBranchId, fromBranchId, type: "transfer", quantity: qty, notes: notes || "Branch transfer", userId: user.id },
      });
    }, { maxWait: 10000, timeout: 30000 });
    return Response.json({ message: "Transfer complete." }, { status: 201 });
  } catch (e) {
    return Response.json({ message: e.message }, { status: 422 });
  }
}
