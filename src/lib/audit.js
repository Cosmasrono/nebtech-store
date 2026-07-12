import prisma from "./prisma";

// Port of Laravel Auditable trait — call from API routes after mutations.
export async function audit({ userId = null, event, type = null, auditableId = null, oldValues = null, newValues = null, req = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        event,
        auditableType: type,
        auditableId: auditableId ? String(auditableId) : null,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
        ipAddress: req?.headers?.get?.("x-forwarded-for")?.split(",")[0] || null,
        userAgent: req?.headers?.get?.("user-agent") || null,
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
