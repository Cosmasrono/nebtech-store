import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth("manage_users");
  if (error) return error;
  const users = await prisma.user.findMany({
    include: { roles: { select: { id: true, name: true, displayName: true } }, branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ data: users.map(({ password, ...u }) => u) });
}

export async function POST(req) {
  const { error } = await requireAuth("manage_users");
  if (error) return error;
  const b = await req.json();
  if (!b.name || !b.email || !b.password) return Response.json({ message: "name, email and password are required." }, { status: 422 });
  const exists = await prisma.user.findUnique({
    where: { email: b.email.toLowerCase() },
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
      name: b.name,
      email: b.email.toLowerCase(),
      phone: b.phone || null,
      password: await hashPassword(b.password),
      branchId: b.branchId || null,
      roleIds: b.roleIds || [],
      isActive: b.isActive ?? true,
    },
  });
  const { password, ...safe } = user;
  return Response.json({ data: safe }, { status: 201 });
}
