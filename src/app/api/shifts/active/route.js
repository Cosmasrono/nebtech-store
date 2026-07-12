import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const shift = await prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } });
  return Response.json({ data: shift });
}
