import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth("change_settings");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const data = { ...b };
  if (b.value != null) data.value = Number(b.value);
  if (b.minSpend != null) data.minSpend = Number(b.minSpend);
  if (b.startDate) data.startDate = new Date(b.startDate);
  if (b.endDate) data.endDate = new Date(b.endDate);
  const old = await prisma.promotion.findUnique({ where: { id } });
  const promo = await prisma.promotion.update({ where: { id }, data });
  await audit({ userId: user.id, event: "updated", type: "Promotion", auditableId: id, oldValues: old, newValues: data, req });
  return Response.json({ data: promo });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth("change_settings");
  if (error) return error;
  const { id } = await params;
  const old = await prisma.promotion.findUnique({ where: { id } });
  await prisma.promotion.delete({ where: { id } });
  await audit({ userId: user.id, event: "deleted", type: "Promotion", auditableId: id, oldValues: old, req });
  return Response.json({ message: "Deleted." });
}
