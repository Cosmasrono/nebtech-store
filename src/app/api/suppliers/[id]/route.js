import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

const EDITABLE = ["description", "contactPerson", "email", "phone", "address", "paymentTerms"];

export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { purchaseOrders: { orderBy: { createdAt: "desc" }, take: 20 }, payments: true } });
  if (!supplier) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ data: supplier });
}

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth("manage_suppliers");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const name = String(b.name ?? "").trim();
  if (!name) return Response.json({ message: "Name is required." }, { status: 422 });
  const old = await prisma.supplier.findUnique({ where: { id } });
  if (!old) return Response.json({ message: "Supplier not found." }, { status: 404 });

  // The form sends the whole row back; only these fields may be changed.
  const data = { name };
  for (const key of EDITABLE) if (b[key] !== undefined) data[key] = b[key] || null;

  const supplier = await prisma.supplier.update({ where: { id }, data });
  await audit({ userId: user.id, event: "updated", type: "Supplier", auditableId: id, oldValues: old, newValues: data, req });
  return Response.json({ data: supplier });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth("manage_suppliers");
  if (error) return error;
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) return Response.json({ message: "Supplier not found." }, { status: 404 });
  const snapshot = { name: supplier.name, phone: supplier.phone, email: supplier.email };

  const [orders, payments] = await Promise.all([
    prisma.purchaseOrder.count({ where: { supplierId: id } }),
    prisma.supplierPayment.count({ where: { supplierId: id } }),
  ]);

  // Past orders and payments must keep their supplier, so these are only hidden from the list.
  if (orders || payments) {
    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    await audit({ userId: user.id, event: "deactivated", type: "Supplier", auditableId: id, oldValues: snapshot, newValues: { orders, payments }, req });
    return Response.json({ message: `${supplier.name} was removed from the list. Its ${orders} purchase order(s) and ${payments} payment(s) are kept.` });
  }

  await prisma.supplier.delete({ where: { id } });
  await audit({ userId: user.id, event: "deleted", type: "Supplier", auditableId: id, oldValues: snapshot, req });
  return Response.json({ message: `${supplier.name} was deleted.` });
}
