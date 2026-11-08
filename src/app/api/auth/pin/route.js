import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const PIN_PATTERN = /^\d{4}$/;

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { pinHash: true } });
  return Response.json({ data: { hasPin: Boolean(row?.pinHash) } });
}

// Set or change the PIN. Needs the account password, so someone at an unlocked screen can't replace it.
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { password, pin } = await req.json().catch(() => ({}));
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) {
    return Response.json({ message: "Your PIN must be exactly 4 digits." }, { status: 422 });
  }
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!password || !row || !(await verifyPassword(String(password), row.password))) {
    return Response.json({ message: "That account password is not correct." }, { status: 422 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { pinHash: await bcrypt.hash(pin, 10), pinFailedAttempts: 0 } });
  await audit({ userId: user.id, event: "pin_set", type: "User", auditableId: user.id, req });
  return Response.json({ message: "PIN saved." });
}
