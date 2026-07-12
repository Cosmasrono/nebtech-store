import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin", "manager")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = 50;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count(),
  ]);
  return Response.json({ data: logs, total, page, perPage });
}
