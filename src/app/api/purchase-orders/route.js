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

  const totalCost = b.items.reduce((s, i) => s + Number(i.quantityOrdered) * Number(i.unitCost), 0);
  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber: generatePoNumber(),
      supplierId: b.supplierId || null,
      supplierName: b.supplierName || null,
      status: b.status || "pending",
      orderDate: b.orderDate ? new Date(b.orderDate) : new Date(),
      expectedDeliveryDate: b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate) : null,
      totalCost,
      notes: b.notes || null,
      createdById: user.id,
      items: {
        create: b.items.map((i) => ({
          productId: i.productId,
          quantityOrdered: Number(i.quantityOrdered),
          unitCost: Number(i.unitCost),
          notes: i.notes || null,
        })),
      },
    },
    include: { items: true },
  });
  return Response.json({ data: order }, { status: 201 });
}
