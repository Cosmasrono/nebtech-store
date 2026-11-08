import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return Response.json({ data: suppliers });
}

export async function POST(req) {
  const { user, error } = await requireAuth("manage_suppliers");
  if (error) return error;
  const b = await req.json();
  if (!b.name) return Response.json({ message: "Name is required." }, { status: 422 });
  const supplier = await prisma.supplier.create({
    data: { name: b.name, description: b.description || null, contactPerson: b.contactPerson || null, email: b.email || null, phone: b.phone || null, address: b.address || null, paymentTerms: b.paymentTerms || null },
  });
  await audit({ userId: user.id, event: "created", type: "Supplier", auditableId: supplier.id, newValues: { name: supplier.name, phone: supplier.phone, email: supplier.email }, req });
  return Response.json({ data: supplier }, { status: 201 });
}
