import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";
import { catalogImage } from "@/lib/product-image";
import catalog from "@/data/cosmetics-catalog.json";

function distribute(total, buckets) {
  const base = Math.floor(total / buckets);
  const rem = total - base * buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < rem ? 1 : 0));
}

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { isMain: "desc" } });
  if (!branches.length) return Response.json({ message: "No active branches to distribute stock to." }, { status: 422 });

  // Retire the current catalog: delete products with no sale history, deactivate the rest.
  const existing = await prisma.product.findMany({
    where: { isActive: true },
    include: { _count: { select: { saleItems: true } } },
  });
  const deletableIds = existing.filter((p) => p._count.saleItems === 0).map((p) => p.id);
  const deactivateIds = existing.filter((p) => p._count.saleItems > 0).map((p) => p.id);

  if (deletableIds.length) {
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.productBatch.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: deletableIds } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: { in: deletableIds } } });
  }
  if (deactivateIds.length) {
    await prisma.product.updateMany({ where: { id: { in: deactivateIds } }, data: { isActive: false } });
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deactivateIds } } });
  }

  const categoryIds = {};
  for (const c of catalog.categories) {
    const category = await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
    categoryIds[c.name] = category.id;
  }

  let created = 0;
  let reactivated = 0;
  for (const item of catalog.products) {
    const { sku, stock: totalStock, costPrice } = item;
    const before = await prisma.product.findUnique({ where: { sku } });
    const perBranch = distribute(totalStock, branches.length);
    const details = {
      name: item.name,
      costPrice,
      sellingPrice: item.sellingPrice,
      reorderLevel: item.reorderLevel,
      genericName: item.genericName,
      brandName: item.brandName,
      packSize: item.packSize,
      manufacturer: item.manufacturer,
      categoryId: categoryIds[item.category],
      isActive: true,
      quantityInStock: totalStock,
      totalCost: (costPrice || 0) * totalStock,
    };

    const product = await prisma.product.upsert({
      where: { sku },
      // Keep a photo the owner has already set; otherwise use the bundled illustration.
      update: { ...details, ...(!before?.imageUrl && { imageUrl: catalogImage(sku) }) },
      create: { ...details, sku, imageUrl: catalogImage(sku) },
    });
    if (before) reactivated++; else created++;

    for (let i = 0; i < branches.length; i++) {
      const qty = perBranch[i];
      await prisma.productBranchStock.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branches[i].id } },
        update: { quantityInStock: qty, initialAllocation: qty },
        create: {
          productId: product.id,
          branchId: branches[i].id,
          quantityInStock: qty,
          initialAllocation: qty,
        },
      });
    }
  }

  return Response.json({
    message:
      `Loaded Cosmetics catalog: ${created} new, ${reactivated} refreshed. ` +
      `Deactivated ${deactivateIds.length} old product(s) (sale history preserved), deleted ${deletableIds.length}. ` +
      `Stock distributed across ${branches.length} branch(es).`,
    data: {
      created,
      reactivated,
      deactivated: deactivateIds.length,
      deleted: deletableIds.length,
      branches: branches.length,
    },
  });
}
