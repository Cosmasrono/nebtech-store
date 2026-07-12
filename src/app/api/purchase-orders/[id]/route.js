import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, items: { include: { product: true } } },
  });
  if (!order) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ data: order });
}

export async function DELETE(req, { params }) {
  const { error } = await requireAuth("create_purchase_order");
  if (error) return error;
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (order?.status === "received") return Response.json({ message: "Cannot delete a received PO." }, { status: 422 });
  await prisma.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
  return Response.json({ message: "Cancelled." });
}
