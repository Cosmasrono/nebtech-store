import prisma from "@/lib/prisma";
import { issuePasswordLink } from "@/lib/password-tokens";
import { audit } from "@/lib/audit";

// Always answers the same way so this can't be used to find out which emails have accounts.
const GENERIC = { message: "If that email belongs to an active account, a reset link is on its way." };

export async function POST(req) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return Response.json({ message: "Enter your email address." }, { status: 422 });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) return Response.json(GENERIC);

  // At most one reset email every 2 minutes per account.
  const recent = await prisma.passwordToken.findFirst({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
  });
  if (recent) return Response.json(GENERIC);

  try {
    await issuePasswordLink(user, "reset", req);
    await audit({ userId: user.id, event: "password_reset_requested", type: "User", auditableId: user.id, req });
  } catch (e) {
    console.error("[auth/password/forgot]", e);
    return Response.json({ message: "We couldn't send the email right now. Please try again later or ask your administrator." }, { status: 503 });
  }
  return Response.json(GENERIC);
}
