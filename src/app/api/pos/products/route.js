import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { user, error } = await requireAuth("process_sales");
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("category_id");
  const q = searchParams.get("q") || "";
  // ?all=1 returns the whole active catalog so the POS can keep selling offline
  const all = searchParams.get("all") === "1";
  const limit = all ? 5000 : 60;

  // Products, branch stock and categories are fetched side by side and joined here:
  // relation filters/includes would cost one sequential round trip to Atlas each.
  const [products, branchStocks, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId && { categoryId }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { genericName: { contains: q, mode: "insensitive" } },
            { brandName: { contains: q, mode: "insensitive" } },
            { barcode: q },
          ],
        }),
      },
      orderBy: { name: "asc" },
      take: user.branchId ? undefined : limit, // branch users are filtered below, then limited
    }),
    user.branchId
      ? prisma.productBranchStock.findMany({ where: { branchId: user.branchId }, select: { productId: true, quantityInStock: true } })
      : null,
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const branchStock = branchStocks && new Map(branchStocks.map((s) => [s.productId, s.quantityInStock]));
  // Branch cashiers only see products allocated to their branch.
  const visible = branchStock ? products.filter((p) => branchStock.has(p.id)).slice(0, limit) : products;

  return Response.json({
    data: visible.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      sellingPrice: p.sellingPrice,
      category: categoryName.get(p.categoryId),
      categoryId: p.categoryId,
      genericName: p.genericName,
      brandName: p.brandName,
      packSize: p.packSize,
      imageUrl: p.imageUrl,
      prescriptionRequired: p.prescriptionRequired,
      stock: branchStock ? branchStock.get(p.id) : p.quantityInStock,
    })),
  });
}
