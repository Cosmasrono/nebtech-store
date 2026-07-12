import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
const COOKIE = "nebtech_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user) {
  const roles = (user.roles || []).map((r) => r.name);
  const token = await new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    branchId: user.branchId || null,
    roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// Lightweight: decode JWT only (no DB hit). Use in middleware/pages.
export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: payload.sub,
      name: payload.name,
      email: payload.email,
      branchId: payload.branchId,
      roles: payload.roles || [],
    };
  } catch {
    return null;
  }
}

// Full: loads fresh user with roles + permissions from DB. Use in API routes.
export async function getAuthUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { roles: { include: { permissions: true } }, branch: true },
  });
  if (!user || !user.isActive) return null;
  return user;
}

export function userHasRole(user, ...names) {
  return (user.roles || []).some((r) => names.includes(r.name));
}

export function userCan(user, permission) {
  if (userHasRole(user, "owner", "super_admin")) return true;
  return (user.roles || []).some((r) =>
    (r.permissions || []).some((p) => p.name === permission)
  );
}

// Guard helper for API routes
/** @param {string | null} [permission] */
export async function requireAuth(permission = null) {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, error: Response.json({ message: "Unauthenticated." }, { status: 401 }) };
  }
  if (permission && !userCan(user, permission)) {
    return { user, error: Response.json({ message: "Forbidden." }, { status: 403 }) };
  }
  return { user, error: null };
}
