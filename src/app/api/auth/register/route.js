import prisma from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";

export async function POST(req) {
  const { name, email, phone, password } = await req.json();
  if (!name || !email || !password || password.length < 8) {
    return Response.json({ message: "Name, email and a password of at least 8 characters are required." }, { status: 422 });
  }
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) return Response.json({ message: "Email already taken." }, { status: 422 });

  const cashierRole = await prisma.role.findUnique({ where: { name: "cashier" } });
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      password: await hashPassword(password),
      roleIds: cashierRole ? [cashierRole.id] : [],
    },
    include: { roles: true },
  });
  await createSession(user);
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
}
