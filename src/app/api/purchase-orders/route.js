import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generatePoNumber } from "@/lib/numbers";

export async function GET(req) {
  const { error } = await requireAuth();
  if (error) return error;
  const orders = await prisma.purchaseOrder.findMany({
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json({ data: orders });
}

export async function POST(req) {
  const { user, error } = await requireAuth("create_purchase_order");
  if (error) return error;
  const b = await req.json();
  if (!Array.isArray(b.items) || !b.items.length) return Response.json({ message: "Items are required." }, { status: 422 });

  // Items may reference an existing productId OR carry a newProduct payload
  // that we create on the fly. Stock stays at 0 until the PO is received —
  // the /receive endpoint then bumps quantityInStock, ProductBranchStock,
  // ProductBatch, and StockMovement automatically.
  const resolvedItems = [];
  for (const i of b.items) {
    let productId = i.productId;
    if (!productId && i.newProduct) {
      const n = i.newProduct;
      if (!n.name || !n.sku || !n.categoryId || !n.sellingPrice) {
        return Response.json({ message: "New product needs name, sku, categoryId, sellingPrice." }, { status: 422 });
      }
      const created = await prisma.product.create({
        data: {
          name: n.name,
          sku: n.sku,
          categoryId: n.categoryId,
          costPrice: Number(i.unitCost) || null,
          sellingPrice: Number(n.sellingPrice),
          reorderLevel: n.reorderLevel != null ? Number(n.reorderLevel) : 10,
          barcode: n.barcode || null,
          genericName: n.genericName || null,
          brandName: n.brandName || null,
          strength: n.strength || null,
          dosageForm: n.dosageForm || null,
          packSize: n.packSize || null,
          manufacturer: n.manufacturer || null,
          prescriptionRequired: !!n.prescriptionRequired,
        },
      });
      productId = created.id;
    }
    if (!productId) return Response.json({ message: "Each item needs a productId or newProduct." }, { status: 422 });
    resolvedItems.push({ productId, quantityOrdered: Number(i.quantityOrdered), unitCost: Number(i.unitCost), notes: i.notes || null });
  }

  let allocations = null;
  if (Array.isArray(b.allocations) && b.allocations.length) {
    const cleaned = b.allocations
      .map((a) => ({ branchId: String(a.branchId || ""), percentage: Number(a.percentage) || 0 }))
      .filter((a) => a.branchId && a.percentage > 0);
    const sum = cleaned.reduce((s, a) => s + a.percentage, 0);
    if (Math.abs(sum - 100) > 0.5) {
      return Response.json({ message: `Branch allocations must sum to 100% (got ${sum.toFixed(1)}%).` }, { status: 422 });
    }
    const ids = cleaned.map((a) => a.branchId);
    const found = await prisma.branch.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== new Set(ids).size) {
      return Response.json({ message: "One or more allocated branches were not found." }, { status: 422 });
    }
    allocations = cleaned;
  }

  const totalCost = resolvedItems.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0);
  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber: generatePoNumber(),
      ...(b.supplierId ? { supplier: { connect: { id: b.supplierId } } } : {}),
      supplierName: b.supplierName || null,
      status: b.status || "pending",
      orderDate: b.orderDate ? new Date(b.orderDate) : new Date(),
      expectedDeliveryDate: b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate) : null,
      totalCost,
      allocations,
      notes: b.notes || null,
      createdById: user.id,
      items: { create: resolvedItems },
    },
    include: { items: true },
  });
  return Response.json({ data: order }, { status: 201 });
}
