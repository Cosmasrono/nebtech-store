import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

// An owner records the outcome of a suspicious-activity alert.
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin")) {
    return Response.json({ message: "Only an owner or super admin can review alerts." }, { status: 403 });
  }
  const { id } = await params;
  const { reviewStatus, reviewNote } = await req.json().catch(() => ({}));
  if (!["cleared", "confirmed"].includes(reviewStatus)) {
    return Response.json({ message: "Choose whether this alert was fine or a real problem." }, { status: 422 });
  }

  const alert = await prisma.auditLog.findUnique({ where: { id } });
  if (!alert?.severity) return Response.json({ message: "Alert not found." }, { status: 404 });

  const note = String(reviewNote || "").trim().slice(0, 500) || null;
  const updated = await prisma.auditLog.update({
    where: { id },
    data: { reviewStatus, reviewNote: note, reviewedById: user.id, reviewedAt: new Date() },
  });
  await audit({
    userId: user.id, event: "alert_reviewed", type: "AuditLog", auditableId: id, req,
    oldValues: { reviewStatus: alert.reviewStatus }, newValues: { reviewStatus, reviewNote: note },
  });
  return Response.json({ data: updated });
}
