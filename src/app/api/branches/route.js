import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
  return Response.json({ data: branches });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const b = await req.json();
  if (!b.name) return Response.json({ message: "Name is required." }, { status: 422 });

  if (b.isMain) {
    // Enforce single main branch (port of enforce_single_main_branch migration)
    await prisma.branch.updateMany({ where: { isMain: true }, data: { isMain: false } });
  }
  const branch = await prisma.branch.create({
    data: {
      name: b.name,
      code: b.code || null,
      address: b.address || null,
      phone: b.phone || null,
      isMain: Boolean(b.isMain),
      stockDistributionPercentage: Number(b.stockDistributionPercentage || 0),
      ownerId: user.id,
    },
  });
  return Response.json({ data: branch }, { status: 201 });
}
