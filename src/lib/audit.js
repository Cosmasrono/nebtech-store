import { after } from "next/server";
import prisma from "./prisma";
import { THRESHOLDS, assessEvent, contextNeeded } from "./audit-rules";
import { notifyOwnersOfAlert } from "./security-alerts";

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);

async function loadContext(entry, userId, auditableId) {
  const need = contextNeeded(entry);
  if (need === "priceHistory") {
    const priceHistory = await prisma.auditLog.findMany({
      where: { event: "updated", auditableType: "Product", auditableId: String(auditableId), createdAt: { gte: hoursAgo(THRESHOLDS.priceFlipWindowHours) } },
      select: { oldValues: true, newValues: true },
      take: 50,
    });
    return { priceHistory };
  }
  if (need === "recentDiscounts" && userId) {
    const sales = await prisma.auditLog.findMany({
      where: { userId, event: "created", auditableType: "Sale", createdAt: { gte: hoursAgo(THRESHOLDS.repeatDiscountWindowHours) } },
      select: { newValues: true },
      take: 500,
    });
    return { recentDiscountCount: sales.filter((s) => Number(s.newValues?.discount) > 0).length };
  }
  if (need === "failedLogins") {
    const attempts = await prisma.auditLog.findMany({
      where: { event: "failed_login", createdAt: { gte: hoursAgo(THRESHOLDS.failedLoginWindowMinutes / 60) } },
      select: { newValues: true },
      take: 200,
    });
    return { recentFailedLogins: attempts.filter((a) => a.newValues?.email === entry.newValues?.email).length };
  }
  return {};
}

/** A broken rule must never lose the log entry itself. */
async function assess(entry, userId, auditableId) {
  try {
    return assessEvent(entry, await loadContext(entry, userId, auditableId));
  } catch (e) {
    console.error("audit rules failed", e);
    return null;
  }
}

function emailOwnersLater(row, assessment) {
  const send = () => notifyOwnersOfAlert(row, assessment).catch((e) => console.error("security alert email failed", e));
  try {
    // Runs after the response, so a cashier never waits on the mail server.
    after(send);
  } catch {
    return send();
  }
}

// Port of Laravel Auditable trait — call from API routes after mutations.
export async function audit({ userId = null, event, type = null, auditableId = null, oldValues = null, newValues = null, req = null }) {
  try {
    const assessment = await assess({ event, type, oldValues, newValues, at: new Date() }, userId, auditableId);
    const row = await prisma.auditLog.create({
      data: {
        userId,
        event,
        auditableType: type,
        auditableId: auditableId ? String(auditableId) : null,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
        ipAddress: req?.headers?.get?.("x-forwarded-for")?.split(",")[0] || null,
        userAgent: req?.headers?.get?.("user-agent") || null,
        ...(assessment && { severity: assessment.severity, flags: assessment.flags, reviewStatus: "open" }),
      },
    });
    if (assessment?.severity === "high") await emailOwnersLater(row, assessment);
  } catch (e) {
    console.error("audit log failed", e);
  }
}
