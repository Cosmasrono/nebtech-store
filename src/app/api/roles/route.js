import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth("manage_users");
  if (error) return error;
  const roles = await prisma.role.findMany({ include: { permissions: true } });
  return Response.json({ data: roles });
}
