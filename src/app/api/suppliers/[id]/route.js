import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { purchaseOrders: { orderBy: { createdAt: "desc" }, take: 20 }, payments: true } });
  if (!supplier) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ data: supplier });
}

export async function PUT(req, { params }) {
  const { error } = await requireAuth("manage_suppliers");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const supplier = await prisma.supplier.update({ where: { id }, data: b });
  return Response.json({ data: supplier });
}

export async function DELETE(req, { params }) {
  const { error } = await requireAuth("manage_suppliers");
  if (error) return error;
  const { id } = await params;
  await prisma.supplier.update({ where: { id }, data: { isActive: false } });
  return Response.json({ message: "Supplier deactivated." });
}
