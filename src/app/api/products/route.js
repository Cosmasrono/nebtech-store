import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(req) {
  const { user, error } = await requireAuth("view_inventory");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category_id");
  const status = searchParams.get("status") || "active"; // active | inactive | all
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25"));

  const where = {
    ...(status === "active" && { isActive: true }),
    ...(status === "inactive" && { isActive: false }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        // { imei: { contains: q, mode: "insensitive" } },
        { genericName: { contains: q, mode: "insensitive" } },
        { brandName: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(categoryId && { categoryId }),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, branchStocks: { include: { branch: { select: { name: true, isMain: true } } } } },
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
  const { name, sku, barcode, /* imei, */ costPrice, sellingPrice, reorderLevel = 10, categoryId, description, expiryDate, batchNumber, branchAllocations = [],
    genericName, brandName, strength, dosageForm, packSize, manufacturer, prescriptionRequired } = body;
  if (!name || !sku || !sellingPrice || !categoryId) {
    return Response.json({ message: "name, sku, sellingPrice and categoryId are required." }, { status: 422 });
  }

  const allocations = branchAllocations
    .map((a) => ({ branchId: a.branchId, quantity: Number(a.quantity) || 0 }))
    .filter((a) => a.branchId && a.quantity > 0);
  const totalStock = allocations.reduce((s, a) => s + a.quantity, 0);

  try {
    const product = await prisma.product.create({
      data: {
        name,
        sku,
        barcode: barcode || null,
        // imei: imei || null,
        description: description || null,
        genericName: genericName || null,
        brandName: brandName || null,
        strength: strength || null,
        dosageForm: dosageForm || null,
        packSize: packSize || null,
        manufacturer: manufacturer || null,
        prescriptionRequired: !!prescriptionRequired,
        costPrice: costPrice != null ? Number(costPrice) : null,
        sellingPrice: Number(sellingPrice),
        quantityInStock: totalStock,
        totalCost: (Number(costPrice) || 0) * totalStock,
        reorderLevel: Number(reorderLevel),
        categoryId,
      },
    });

    for (const a of allocations) {
      await prisma.productBranchStock.create({
        data: { productId: product.id, branchId: a.branchId, quantityInStock: a.quantity, initialAllocation: a.quantity },
      });
      if (expiryDate || batchNumber) {
        await prisma.productBatch.create({
          data: {
            productId: product.id,
            branchId: a.branchId,
            batchNumber: batchNumber || null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            quantity: a.quantity,
            costPrice: costPrice != null ? Number(costPrice) : null,
            receivedAt: new Date(),
          },
        });
      }
      await prisma.stockMovement.create({
        data: { productId: product.id, branchId: a.branchId, type: "purchase", quantity: a.quantity, notes: "Opening stock", userId: user.id },
      });
    }

    await audit({ userId: user.id, event: "created", type: "Product", auditableId: product.id, newValues: body, req });
    return Response.json({ data: product }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") return Response.json({ message: "SKU or barcode already exists." }, { status: 422 });
    throw e;
  }
}
