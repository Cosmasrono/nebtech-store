// Emails owners about high-severity audit alerts.
import prisma from "./prisma";
import { mailConfigured, sendSecurityAlertEmail } from "./mail";

// A burst (say, a bulk price edit) should not send hundreds of emails.
const MAX_ALERTS_PER_HOUR = 10;

export async function notifyOwnersOfAlert(row, assessment) {
  if (!mailConfigured()) return;
  const recent = await prisma.auditLog.count({ where: { severity: "high", createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent > MAX_ALERTS_PER_HOUR) return;

  const roles = await prisma.role.findMany({ where: { name: { in: ["owner", "super_admin"] } }, select: { id: true } });
  const [owners, actor] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, roleIds: { hasSome: roles.map((r) => r.id) } }, select: { email: true } }),
    row.userId ? prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } }) : null,
  ]);
  await Promise.allSettled(owners.map((o) => sendSecurityAlertEmail({
    to: o.email,
    actor: actor?.name || "Unknown (not signed in)",
    when: row.createdAt,
    reasons: assessment.flags.map((f) => f.message),
  })));
}
