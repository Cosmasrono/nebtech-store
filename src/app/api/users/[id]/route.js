import prisma from "@/lib/prisma";
import { requireAuth, invalidateAuthUser, isTopRole } from "@/lib/auth";
import { canManageUser, resolveAssignableRole } from "@/lib/roles";
import { audit } from "@/lib/audit";

async function loadTarget(id) {
  return prisma.user.findUnique({ where: { id }, include: { roles: true } });
}

export async function PUT(req, { params }) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();

  const target = await loadTarget(id);
  if (!target) return Response.json({ message: "User not found." }, { status: 404 });
  if (!canManageUser(me, target)) {
    return Response.json({ message: "Only an owner or super admin can change this account." }, { status: 403 });
  }

  const data = {};
  for (const k of ["name", "phone", "branchId"]) if (b[k] !== undefined) data[k] = b[k] || (k === "name" ? target.name : null);
  if (b.email) data.email = String(b.email).toLowerCase().trim();
  if (b.roleId !== undefined) {
    const { role, error: roleError } = await resolveAssignableRole(me, b.roleId);
    if (roleError) return Response.json({ message: roleError }, { status: 422 });
    if (id === me.id && !target.roleIds.includes(role.id)) {
      return Response.json({ message: "You can't change your own role. Ask another administrator." }, { status: 422 });
    }
    data.roleIds = [role.id];
  }
  if (b.isActive !== undefined) {
    if (id === me.id && !b.isActive) return Response.json({ message: "You cannot deactivate yourself." }, { status: 422 });
    data.isActive = Boolean(b.isActive);
  }
  // Passwords are no longer typed in by admins; use "Send password link" instead.

  try {
    const user = await prisma.user.update({ where: { id }, data });
    invalidateAuthUser(id);
    await audit({ userId: me.id, event: "updated", type: "User", auditableId: id, newValues: { ...data }, req });
    const { password, ...safe } = user;
    return Response.json({ data: safe });
  } catch (e) {
    if (e.code === "P2002") return Response.json({ message: "Another user already has that email." }, { status: 422 });
    throw e;
  }
}

// Records that name a user and must keep pointing at a real account.
// A user with any of these can be disabled, not deleted, so reports and receipts stay intact.
const HISTORY = [
  ["sales", (id) => prisma.sale.count({ where: { cashierId: id } })],
  ["shifts", (id) => prisma.shift.count({ where: { OR: [{ cashierId: id }, { openedById: id }, { closedById: id }] } })],
  ["expenses", (id) => prisma.expense.count({ where: { OR: [{ recordedById: id }, { approvedById: id }] } })],
  ["other income entries", (id) => prisma.otherIncome.count({ where: { recordedById: id } })],
  ["stock movements", (id) => prisma.stockMovement.count({ where: { userId: id } })],
  ["purchase orders", (id) => prisma.purchaseOrder.count({ where: { OR: [{ createdById: id }, { receivedById: id }] } })],
  ["supplier payments", (id) => prisma.supplierPayment.count({ where: { recordedById: id } })],
  ["returns", (id) => prisma.return.count({ where: { OR: [{ requestedById: id }, { approvedById: id }] } })],
  ["M-Pesa transactions", (id) => prisma.mpesaTransaction.count({ where: { userId: id } })],
  ["invoices", (id) => prisma.invoice.count({ where: { createdById: id } })],
  ["invoice payments", (id) => prisma.invoicePayment.count({ where: { recordedById: id } })],
  ["loans", (id) => prisma.loan.count({ where: { userId: id } })],
  ["loan payments", (id) => prisma.loanPayment.count({ where: { userId: id } })],
  ["branches they own", (id) => prisma.branch.count({ where: { ownerId: id } })],
];

async function permanentlyDelete(req, me, target) {
  const id = target.id;

  // Never remove the last account that can run the system.
  if ((target.roles || []).some(isTopRole)) {
    const topRoleIds = (await prisma.role.findMany({ select: { id: true, name: true } })).filter(isTopRole).map((r) => r.id);
    const otherTop = await prisma.user.count({
      where: { id: { not: id }, isActive: true, roleIds: { hasSome: topRoleIds } },
    });
    if (!otherTop) {
      return Response.json({ message: "This is the last active owner/admin account, so it can't be deleted." }, { status: 422 });
    }
  }

  const counts = await Promise.all(HISTORY.map(async ([label, count]) => [label, await count(id)]));
  const found = counts.filter(([, n]) => n > 0);
  if (found.length) {
    const list = found.map(([label, n]) => `${n} ${label}`).join(", ");
    return Response.json({
      message: `${target.name} has ${list} on record, so they can't be deleted without breaking those records. Disable the account instead.`,
      history: Object.fromEntries(found),
    }, { status: 409 });
  }

  await prisma.passwordToken.deleteMany({ where: { userId: id } });
  await prisma.cartItem.deleteMany({ where: { userId: id } });
  await prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } });
  for (const role of await prisma.role.findMany({ where: { userIds: { has: id } }, select: { id: true, userIds: true } })) {
    await prisma.role.update({ where: { id: role.id }, data: { userIds: role.userIds.filter((u) => u !== id) } });
  }
  await prisma.user.delete({ where: { id } });
  invalidateAuthUser(id);
  await audit({
    userId: me.id, event: "deleted", type: "User", auditableId: id, req,
    oldValues: { name: target.name, email: target.email, roles: (target.roles || []).map((r) => r.name) },
  });
  return Response.json({ message: `${target.name} was permanently deleted.` });
}

export async function DELETE(req, { params }) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  if (id === me.id) {
    return Response.json({ message: permanent ? "You cannot delete your own account." : "You cannot deactivate yourself." }, { status: 422 });
  }
  const target = await loadTarget(id);
  if (!target) return Response.json({ message: "User not found." }, { status: 404 });
  if (!canManageUser(me, target)) {
    return Response.json({ message: `Only an owner or super admin can ${permanent ? "delete" : "deactivate"} this account.` }, { status: 403 });
  }
  if (permanent) return permanentlyDelete(req, me, target);
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  invalidateAuthUser(id);
  await audit({ userId: me.id, event: "deactivated", type: "User", auditableId: id, req });
  return Response.json({ message: "User deactivated." });
}
