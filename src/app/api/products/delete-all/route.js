import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const products = await prisma.product.findMany({
    select: { id: true, _count: { select: { saleItems: true, poItems: true } } },
  });

  const deletableIds = products.filter((p) => !p._count.saleItems && !p._count.poItems).map((p) => p.id);
  const deactivateIds = products.filter((p) => p._count.saleItems || p._count.poItems).map((p) => p.id);

  if (deletableIds.length) {
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.productBatch.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: deletableIds } } }).catch(() => {});
    await prisma.cartItem.deleteMany({ where: { productId: { in: deletableIds } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: { in: deletableIds } } });
  }
  if (deactivateIds.length) {
    await prisma.product.updateMany({ where: { id: { in: deactivateIds } }, data: { isActive: false } });
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deactivateIds } } });
  }

  await audit({
    userId: user.id,
    event: "bulk_deleted",
    type: "Product",
    auditableId: null,
    newValues: { deleted: deletableIds.length, deactivated: deactivateIds.length },
    req,
  });

  return Response.json({
    message: `Removed ${deletableIds.length} product(s). ${deactivateIds.length} kept as inactive (sale/PO history preserved).`,
    data: { deleted: deletableIds.length, deactivated: deactivateIds.length },
  });
}
