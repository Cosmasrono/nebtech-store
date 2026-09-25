import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageUser } from "@/lib/roles";
import { sendLinkOrReturnIt } from "@/lib/password-tokens";
import { audit } from "@/lib/audit";

// Admin: (re)send a user their "set your password" link.
// New users who haven't set a password get an invite; everyone else gets a reset link.
export async function POST(req, { params }) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
  if (!target) return Response.json({ message: "User not found." }, { status: 404 });
  if (!target.isActive) return Response.json({ message: "Activate this user before sending a link." }, { status: 422 });
  if (!canManageUser(me, target)) {
    return Response.json({ message: "Only an owner or super admin can reset this account." }, { status: 403 });
  }

  const purpose = target.passwordChangedAt || target.emailVerifiedAt ? "reset" : "invite";
  const result = await sendLinkOrReturnIt(target, purpose, req);
  await audit({ userId: me.id, event: "password_link_sent", type: "User", auditableId: id, newValues: { purpose, emailSent: result.emailSent }, req });
  return Response.json({
    message: result.emailSent ? `Link emailed to ${target.email}.` : "The email couldn't be sent. Copy the link below and send it to the user another way.",
    ...result,
  });
}
