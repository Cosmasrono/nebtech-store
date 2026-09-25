import prisma from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Self sign-up is only for setting up a brand-new system: the first account becomes the owner.
// After that, staff accounts are created by an administrator (Users page), who emails them a link.
export async function POST(req) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return Response.json(
      { message: "Sign-up is closed. Ask your administrator to create an account for you." },
      { status: 403 },
    );
  }

  const { name, email, phone, password } = await req.json().catch(() => ({}));
  if (!name || !email || !password || password.length < 8) {
    return Response.json({ message: "Name, email and a password of at least 8 characters are required." }, { status: 422 });
  }

  const ownerRole = await prisma.role.findUnique({ where: { name: "owner" } });
  if (!ownerRole) {
    return Response.json({ message: "Roles are missing. Run the database seed (pnpm db:seed) first." }, { status: 500 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      password: await hashPassword(password),
      roleIds: [ownerRole.id],
    },
    include: { roles: true },
  });
  await createSession(user);
  await audit({ userId: user.id, event: "created", type: "User", auditableId: user.id, newValues: { firstOwner: true }, req });
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
}
