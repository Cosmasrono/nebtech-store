import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PUT(req, { params }) {
  const { error } = await requireAuth("change_settings");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const data = { ...b };
  if (b.value != null) data.value = Number(b.value);
  if (b.minSpend != null) data.minSpend = Number(b.minSpend);
  if (b.startDate) data.startDate = new Date(b.startDate);
  if (b.endDate) data.endDate = new Date(b.endDate);
  const promo = await prisma.promotion.update({ where: { id }, data });
  return Response.json({ data: promo });
}

export async function DELETE(req, { params }) {
  const { error } = await requireAuth("change_settings");
  if (error) return error;
  const { id } = await params;
  await prisma.promotion.delete({ where: { id } });
  return Response.json({ message: "Deleted." });
}
