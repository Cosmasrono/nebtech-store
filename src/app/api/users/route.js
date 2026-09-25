import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireAuth, hashPassword } from "@/lib/auth";
import { sendLinkOrReturnIt } from "@/lib/password-tokens";
import { resolveAssignableRole } from "@/lib/roles";
import { audit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth("manage_users");
  if (error) return error;
  const users = await prisma.user.findMany({
    include: { roles: { select: { id: true, name: true, displayName: true } }, branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  // Never send password hashes to the browser. `hasSetPassword` tells the admin whether the invite was used.
  return Response.json({
    data: users.map(({ password, passwordChangedAt, emailVerifiedAt, ...u }) => ({
      ...u,
      hasSetPassword: Boolean(passwordChangedAt || emailVerifiedAt),
    })),
  });
}

export async function POST(req) {
  const { user: me, error } = await requireAuth("manage_users");
  if (error) return error;
  const b = await req.json();

  const name = String(b.name || "").trim();
  const email = String(b.email || "").toLowerCase().trim();
  if (!name || !email) return Response.json({ message: "Name and email are required." }, { status: 422 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ message: "Enter a valid email address." }, { status: 422 });

  const { role, error: roleError } = await resolveAssignableRole(me, b.roleId);
  if (roleError) return Response.json({ message: roleError }, { status: 422 });

  const exists = await prisma.user.findUnique({
    where: { email },
    include: { branch: { select: { name: true } } },
  });
  if (exists) {
    const message = exists.branch
      ? `This user already belongs to ${exists.branch.name}. A user can only be registered in one branch.`
      : "This email is already registered.";
    return Response.json({ message }, { status: 422 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: b.phone || null,
      // Random placeholder nobody knows. The user sets their real password from the emailed link.
      password: await hashPassword(randomBytes(32).toString("hex")),
      branchId: b.branchId || null,
      roleIds: [role.id],
      isActive: b.isActive ?? true,
    },
  });
  await audit({ userId: me.id, event: "created", type: "User", auditableId: user.id, newValues: { name, email, role: role.name }, req });

  const link = await sendLinkOrReturnIt(user, "invite", req);
  const { password, ...safe } = user;
  return Response.json({ data: safe, ...link }, { status: 201 });
}
