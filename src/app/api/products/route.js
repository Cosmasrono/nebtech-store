import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(req) {
  const { user, error } = await requireAuth("view_inventory");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category_id");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25"));

  const where = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(categoryId && { categoryId }),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, branchStocks: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
  ]);

  return Response.json({ data: items, total, page, perPage });
}

export async function POST(req) {
  const { user, error } = await requireAuth("manage_products");
  if (error) return error;

  const body = await req.json();
  const { name, sku, barcode, costPrice, sellingPrice, quantityInStock = 0, reorderLevel = 10, categoryId, description, expiryDate, batchNumber } = body;
  if (!name || !sku || !sellingPrice || !categoryId) {
    return Response.json({ message: "name, sku, sellingPrice and categoryId are required." }, { status: 422 });
  }

  try {
    const product = await prisma.product.create({
      data: {
        name,
        sku,
        barcode: barcode || null,
        description: description || null,
        costPrice: costPrice != null ? Number(costPrice) : null,
        sellingPrice: Number(sellingPrice),
        quantityInStock: Number(quantityInStock),
        totalCost: (Number(costPrice) || 0) * Number(quantityInStock),
        reorderLevel: Number(reorderLevel),
        categoryId,
      },
    });

    // Allocate opening stock to main branch + optional batch (expiry tracking)
    if (Number(quantityInStock) > 0) {
      const main = await prisma.branch.findFirst({ where: { isMain: true } });
      if (main) {
        await prisma.productBranchStock.create({
          data: { productId: product.id, branchId: main.id, quantityInStock: Number(quantityInStock), initialAllocation: Number(quantityInStock) },
        });
        if (expiryDate || batchNumber) {
          await prisma.productBatch.create({
            data: {
              productId: product.id,
              branchId: main.id,
              batchNumber: batchNumber || null,
              expiryDate: expiryDate ? new Date(expiryDate) : null,
              quantity: Number(quantityInStock),
              costPrice: costPrice != null ? Number(costPrice) : null,
              receivedAt: new Date(),
            },
          });
        }
      }
      await prisma.stockMovement.create({
        data: { productId: product.id, branchId: main?.id, type: "purchase", quantity: Number(quantityInStock), notes: "Opening stock", userId: user.id },
      });
    }

    await audit({ userId: user.id, event: "created", type: "Product", auditableId: product.id, newValues: body, req });
    return Response.json({ data: product }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") return Response.json({ message: "SKU or barcode already exists." }, { status: 422 });
    throw e;
  }
}
