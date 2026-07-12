import prisma from "@/lib/prisma";
import { requireAuth, hashPassword } from "@/lib/auth";

export async function PUT(req, { params }) {
  const { error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const data = {};
  for (const k of ["name", "phone", "branchId"]) if (b[k] !== undefined) data[k] = b[k];
  if (b.email) data.email = b.email.toLowerCase();
  if (b.roleIds) data.roleIds = b.roleIds;
  if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
  if (b.password) data.password = await hashPassword(b.password);
  const user = await prisma.user.update({ where: { id }, data });
  const { password, ...safe } = user;
  return Response.json({ data: safe });
}

export async function DELETE(req, { params }) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const { id } = await params;
  if (id === me.id) return Response.json({ message: "You cannot deactivate yourself." }, { status: 422 });
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return Response.json({ message: "User deactivated." });
}
