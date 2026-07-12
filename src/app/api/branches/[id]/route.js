import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const b = await req.json();
  if (b.isMain) await prisma.branch.updateMany({ where: { isMain: true, NOT: { id } }, data: { isMain: false } });
  const branch = await prisma.branch.update({
    where: { id },
    data: {
      ...(b.name && { name: b.name }),
      ...(b.code !== undefined && { code: b.code }),
      ...(b.address !== undefined && { address: b.address }),
      ...(b.phone !== undefined && { phone: b.phone }),
      ...(b.isMain !== undefined && { isMain: Boolean(b.isMain) }),
      ...(b.stockDistributionPercentage !== undefined && { stockDistributionPercentage: Number(b.stockDistributionPercentage) }),
    },
  });
  return Response.json({ data: branch });
}
