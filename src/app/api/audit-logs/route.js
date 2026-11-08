import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

const FLAGGED = { severity: { in: ["low", "medium", "high"] } };
const OPEN = { reviewStatus: "open" };

function filterFor(view, status) {
  if (view !== "alerts") return {};
  if (status === "reviewed") return { ...FLAGGED, reviewStatus: { in: ["cleared", "confirmed"] } };
  return { ...FLAGGED, ...OPEN };
}

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin", "manager")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = 50;
  const where = filterFor(searchParams.get("view"), searchParams.get("status"));
  const [logs, total, openAlerts, aiSummary, aiGeneratedAt] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...FLAGGED, ...OPEN } }),
    prisma.setting.findUnique({ where: { key: "ai_alert_review_summary" } }),
    prisma.setting.findUnique({ where: { key: "ai_alert_review_generated_at" } }),
  ]);

  const reviewerIds = [...new Set(logs.map((l) => l.reviewedById).filter(Boolean))];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
    : [];
  const reviewerName = Object.fromEntries(reviewers.map((r) => [r.id, r.name]));

  return Response.json({
    data: logs.map((l) => ({ ...l, reviewedByName: reviewerName[l.reviewedById] || null })),
    total,
    page,
    perPage,
    openAlerts,
    canReview: userHasRole(user, "owner", "super_admin"),
    aiReview: { summary: aiSummary?.value || null, generatedAt: aiGeneratedAt?.value || null },
  });
}
