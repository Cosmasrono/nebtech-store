// One-time "set your password" links for new users (invite) and forgotten passwords (reset).
import { createHash, randomBytes } from "node:crypto";
import prisma from "./prisma";
import { sendPasswordLinkEmail } from "./mail";

const TTL_HOURS = { invite: 72, reset: 1 };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function appUrl(req) {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Fall back to the address the admin is using right now.
  return req ? new URL(req.url).origin : "http://localhost:3000";
}

/** Creates a token (replacing any unused ones) and returns the set-password link. */
export async function createPasswordLink(user, purpose, req) {
  await prisma.passwordToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      purpose,
      expiresAt: new Date(Date.now() + TTL_HOURS[purpose] * 3600_000),
    },
  });
  return `${appUrl(req)}/set-password?token=${token}`;
}

/** Creates a link and emails it. Throws if the email can't be sent. */
export async function issuePasswordLink(user, purpose, req) {
  const link = await createPasswordLink(user, purpose, req);
  await sendPasswordLinkEmail({ to: user.email, name: user.name, link, purpose, expiresHours: TTL_HOURS[purpose] });
  return link;
}

/**
 * For admins: email the link; if email fails, return the link so the admin can
 * pass it on another way (WhatsApp, SMS). Result: { emailSent, manualLink, emailError }
 */
export async function sendLinkOrReturnIt(user, purpose, req) {
  try {
    await issuePasswordLink(user, purpose, req);
    return { emailSent: true, manualLink: null, emailError: null };
  } catch (e) {
    console.error("[password link] email failed", e);
    const manualLink = await createPasswordLink(user, purpose, req);
    return { emailSent: false, manualLink, emailError: e.message };
  }
}

/** Returns the token row if it's valid and unused, else null. */
export async function findValidToken(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const row = await prisma.passwordToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user?.isActive) return null;
  return row;
}

/** Marks the token used. Returns false if another request used it first. */
export async function consumeToken(id) {
  const res = await prisma.passwordToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1;
}
