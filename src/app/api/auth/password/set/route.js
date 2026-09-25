import prisma from "@/lib/prisma";
import { hashPassword, invalidateAuthUser } from "@/lib/auth";
import { consumeToken, findValidToken } from "@/lib/password-tokens";
import { audit } from "@/lib/audit";

const INVALID = { message: "This link is invalid or has expired. Ask your administrator for a new one, or use “Forgot password” on the sign-in page." };

// GET ?token=… — lets the page greet the user and show whether this is a new account.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const row = await findValidToken(token);
  if (!row) return Response.json(INVALID, { status: 410 });
  return Response.json({ data: { name: row.user.name, email: row.user.email, purpose: row.purpose } });
}

export async function POST(req) {
  const { token, password } = await req.json().catch(() => ({}));
  if (!password || typeof password !== "string" || password.length < 8) {
    return Response.json({ message: "Use at least 8 characters for your password." }, { status: 422 });
  }
  if (password.length > 128) {
    return Response.json({ message: "That password is too long." }, { status: 422 });
  }

  const row = await findValidToken(token);
  if (!row || !(await consumeToken(row.id))) return Response.json(INVALID, { status: 410 });

  await prisma.user.update({
    where: { id: row.userId },
    data: {
      password: await hashPassword(password),
      passwordChangedAt: new Date(),
      // Clicking an emailed link proves the address works.
      emailVerifiedAt: new Date(),
    },
  });
  invalidateAuthUser(row.userId);
  await audit({ userId: row.userId, event: row.purpose === "invite" ? "password_set" : "password_reset", type: "User", auditableId: row.userId, req });
  return Response.json({ message: "Password saved. You can now sign in." });
}
