import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { user, error } = await requireAuth("process_sales");
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  // ?all=1 returns the whole active catalog so the POS can keep selling offline
  const all = searchParams.get("all") === "1";

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(user.branchId && { branchStocks: { some: { branchId: user.branchId } } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: q },
        ],
      }),
    },
    include: {
      category: true,
      branchStocks: user.branchId ? { where: { branchId: user.branchId } } : true,
    },
    orderBy: { name: "asc" },
    take: all ? 5000 : 60,
  });

  return Response.json({
    data: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      sellingPrice: p.sellingPrice,
      category: p.category?.name,
      stock: user.branchId
        ? p.branchStocks.reduce((s, b) => s + b.quantityInStock, 0)
        : p.quantityInStock,
    })),
  });
}
