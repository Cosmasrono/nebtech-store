import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requestAiReview } from "@/lib/audit-ai";

export const maxDuration = 60;

const MAX_ALERTS = 40;
const OUTCOME_WINDOW_DAYS = 90;

const saveSetting = (key, value, description) =>
  prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, description } });

// Asks the AI for an opinion on open alerts and stores it beside each one. It changes nothing else.
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin")) {
    return Response.json({ message: "Only an owner or super admin can run the AI review." }, { status: 403 });
  }
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ message: "AI is not configured. Set GROQ_API_KEY and restart the server." }, { status: 503 });
  }

  const open = await prisma.auditLog.findMany({
    where: { reviewStatus: "open" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ALERTS,
  });
  if (!open.length) return Response.json({ message: "There are no open alerts to review." }, { status: 422 });

  const alerts = open.map((a) => ({
    id: a.id,
    when: new Date(a.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
    person: a.user?.name || "Unknown (not signed in)",
    severity: a.severity,
    reasons: (a.flags || []).map((f) => f.message),
  }));

  const userIds = [...new Set(open.map((a) => a.userId).filter(Boolean))];
  const earlier = userIds.length
    ? await prisma.auditLog.findMany({
        where: {
          userId: { in: userIds },
          reviewStatus: { in: ["cleared", "confirmed"] },
          createdAt: { gte: new Date(Date.now() - OUTCOME_WINDOW_DAYS * 86400000) },
        },
        select: { reviewStatus: true, user: { select: { name: true } } },
      })
    : [];
  const pastOutcomes = {};
  for (const e of earlier) {
    const row = (pastOutcomes[e.user?.name || "Unknown"] ??= { cleared: 0, confirmed: 0 });
    row[e.reviewStatus] += 1;
  }

  let review;
  try {
    review = await requestAiReview(alerts, pastOutcomes);
  } catch (e) {
    return Response.json({ message: e.message }, { status: 502 });
  }

  const generatedAt = new Date().toISOString();
  await Promise.all(review.alerts.map(({ id, ...opinion }) =>
    prisma.auditLog.update({ where: { id }, data: { aiAssessment: { ...opinion, generatedAt } } })
  ));
  await saveSetting("ai_alert_review_summary", review.summary, "Latest AI review of open suspicious-activity alerts");
  await saveSetting("ai_alert_review_generated_at", generatedAt, "When the AI last reviewed alerts");
  await audit({ userId: user.id, event: "ai_review_run", type: "AuditLog", newValues: { alerts: alerts.length, assessed: review.alerts.length }, req });

  return Response.json({ data: { summary: review.summary, generatedAt, assessed: review.alerts.length } });
}
