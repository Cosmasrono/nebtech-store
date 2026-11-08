import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth, destroySession } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Only 10,000 PINs exist, so guesses must be strictly limited.
const MAX_ATTEMPTS = 5;

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { pin } = await req.json().catch(() => ({}));

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { pinHash: true } });
  if (!row?.pinHash) return Response.json({ message: "Set a PIN first." }, { status: 409 });

  // Counted before checking, so parallel guesses can't slip past the limit.
  const { pinFailedAttempts: attempts } = await prisma.user.update({
    where: { id: user.id },
    data: { pinFailedAttempts: { increment: 1 } },
    select: { pinFailedAttempts: true },
  });

  const correct = attempts <= MAX_ATTEMPTS && typeof pin === "string" && (await bcrypt.compare(pin, row.pinHash));
  if (correct) {
    await prisma.user.update({ where: { id: user.id }, data: { pinFailedAttempts: 0 } });
    return Response.json({ message: "Unlocked." });
  }

  if (attempts >= MAX_ATTEMPTS) {
    await prisma.user.update({ where: { id: user.id }, data: { pinFailedAttempts: 0 } });
    await audit({ userId: user.id, event: "pin_lockout", type: "User", auditableId: user.id, req });
    await destroySession();
    return Response.json({ message: "Too many wrong PINs. Please sign in again." }, { status: 401 });
  }
  const left = MAX_ATTEMPTS - attempts;
  return Response.json({ message: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` }, { status: 422 });
}
