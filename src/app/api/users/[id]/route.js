import prisma from "@/lib/prisma";
import { requireAuth, invalidateAuthUser } from "@/lib/auth";
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

export async function DELETE(req, { params }) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;
  if (id === me.id) return Response.json({ message: "You cannot deactivate yourself." }, { status: 422 });
  const target = await loadTarget(id);
  if (!target) return Response.json({ message: "User not found." }, { status: 404 });
  if (!canManageUser(me, target)) {
    return Response.json({ message: "Only an owner or super admin can deactivate this account." }, { status: 403 });
  }
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  invalidateAuthUser(id);
  await audit({ userId: me.id, event: "deactivated", type: "User", auditableId: id, req });
  return Response.json({ message: "User deactivated." });
}
