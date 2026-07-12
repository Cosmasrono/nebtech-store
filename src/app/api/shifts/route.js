import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const shifts = await prisma.shift.findMany({
    where: { cashierId: user.id },
    orderBy: { openedAt: "desc" },
    take: 30,
  });
  return Response.json({ data: shifts });
}

export async function POST(req) {
  const { user, error } = await requireAuth("open_shift");
  if (error) return error;
  const { openingCash, openingNotes } = await req.json();

  const existing = await prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } });
  if (existing) return Response.json({ message: "You already have an open shift." }, { status: 422 });

  const shift = await prisma.shift.create({
    data: {
      cashierId: user.id,
      openedAt: new Date(),
      status: "open",
      openingCash: Number(openingCash || 0),
      openingNotes: openingNotes || null,
      openedById: user.id,
    },
  });
  return Response.json({ data: shift }, { status: 201 });
}
