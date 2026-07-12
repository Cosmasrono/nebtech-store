import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (code) {
    const now = new Date();
    const promo = await prisma.promotion.findFirst({
      where: {
        code,
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
    });
    if (!promo) return Response.json({ message: "Invalid or expired promo code." }, { status: 404 });
    return Response.json({ data: promo });
  }
  const promos = await prisma.promotion.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ data: promos });
}

export async function POST(req) {
  const { error } = await requireAuth("change_settings");
  if (error) return error;
  const b = await req.json();
  if (!b.name || b.value == null) return Response.json({ message: "name and value are required." }, { status: 422 });
  const promo = await prisma.promotion.create({
    data: {
      name: b.name,
      code: b.code || null,
      type: b.type || "fixed",
      value: Number(b.value),
      minSpend: Number(b.minSpend || 0),
      startDate: b.startDate ? new Date(b.startDate) : null,
      endDate: b.endDate ? new Date(b.endDate) : null,
      isActive: b.isActive ?? true,
    },
  });
  return Response.json({ data: promo }, { status: 201 });
}
