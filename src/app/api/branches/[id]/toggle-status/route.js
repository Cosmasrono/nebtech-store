import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return Response.json({ message: "Not found." }, { status: 404 });
  const updated = await prisma.branch.update({ where: { id }, data: { isActive: !branch.isActive } });
  return Response.json({ data: updated });
}
