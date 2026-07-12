import prisma from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return Response.json({ message: "Email and password are required." }, { status: 422 });
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    include: { roles: true },
  });

  if (!user || !(await verifyPassword(password, user.password))) {
    await audit({ event: "failed_login", newValues: { email }, req });
    return Response.json({ message: "These credentials do not match our records." }, { status: 422 });
  }
  if (!user.isActive) {
    return Response.json({ message: "Your account has been deactivated." }, { status: 403 });
  }

  await createSession(user);
  await audit({ userId: user.id, event: "login", req });
  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, roles: user.roles.map((r) => r.name) },
  });
}
