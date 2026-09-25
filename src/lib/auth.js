import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

const rawSecret = process.env.AUTH_SECRET;
if (!rawSecret || rawSecret.length < 32 || rawSecret === "change-me-to-a-long-random-string") {
  throw new Error(
    "AUTH_SECRET must be set to a random string of 32+ characters. Generate one with: openssl rand -base64 48"
  );
}
const SECRET = new TextEncoder().encode(rawSecret);
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
      issuedAt: payload.iat,
    };
  } catch {
    return null;
  }
}

// Loading a user with roles + permissions costs 3-4 round trips to MongoDB Atlas.
// Every page and API call needs it, so keep it for a few seconds per server process.
// Role changes, deactivation and password changes call invalidateAuthUser() so they
// apply immediately on this server (other server instances catch up within the TTL).
const AUTH_TTL_MS = 20_000;
const authCache = new Map(); // userId -> { user, expires }

export function invalidateAuthUser(userId) {
  if (userId) authCache.delete(String(userId));
  else authCache.clear();
}

async function loadAuthUser(userId) {
  const hit = authCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.user;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { permissions: true } }, branch: true },
  });
  authCache.set(userId, { user, expires: Date.now() + AUTH_TTL_MS });
  if (authCache.size > 500) authCache.delete(authCache.keys().next().value);
  return user;
}

// Full: loads the user with roles + permissions (cached briefly, deduped per request).
export const getAuthUser = cache(async function getAuthUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await loadAuthUser(session.userId);
  if (!user || !user.isActive) return null;
  // Sessions issued before the latest password change are no longer valid.
  if (user.passwordChangedAt && session.issuedAt && session.issuedAt * 1000 < user.passwordChangedAt.getTime() - 1000) {
    return null;
  }

  // If email is in ADMIN_EMAILS, ensure owner role is assigned in memory and DB
  if (isAdminEmail(user.email)) {
    const hasOwnerRole = (user.roles || []).some((r) => r.name === "owner" || r.name === "super_admin");
    if (!hasOwnerRole) {
      const ownerRole = await prisma.role.findFirst({ where: { name: "owner" } });
      if (ownerRole) {
        if (!user.roleIds.includes(ownerRole.id)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { roleIds: { push: ownerRole.id } },
          }).catch(() => {});
        }
        user.roles.push(ownerRole);
      }
    }
  }

  return user;
});

export function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  const admins = getAdminEmails();
  return admins.includes(String(email).trim().toLowerCase());
}

function normalizeRoleName(name) {
  return String(name || "").trim().toLowerCase();
}

function roleMatches(grantedRoleName, requiredRoleName) {
  const granted = normalizeRoleName(grantedRoleName);
  const required = normalizeRoleName(requiredRoleName);

  if (!granted || !required) return false;
  if (granted === required) return true;

  // Treat common admin aliases as equivalent to top-level admin roles.
  if (["admin", "superadmin", "super_admin"].includes(granted) && ["super_admin", "owner"].includes(required)) {
    return true;
  }

  return false;
}

export function userHasRole(user, ...names) {
  if (user && isAdminEmail(user.email)) return true;
  return (user?.roles || []).some((r) =>
    names.some((name) => roleMatches(r.name, name))
  );
}

const TOP_ROLE_NAMES = ["owner", "super_admin", "superadmin", "admin"];

/** True for roles that carry full system access (owner / super admin). */
export function isTopRole(role) {
  return TOP_ROLE_NAMES.includes(normalizeRoleName(role?.name));
}

/** Owners and super admins (or ADMIN_EMAILS). Only they may grant or edit top-level access. */
export function isTopAdmin(user) {
  return userHasRole(user, "owner", "super_admin");
}

export function userCan(user, permission) {
  if (user && isAdminEmail(user.email)) return true;
  if (userHasRole(user, "owner", "super_admin")) return true;
  return (user?.roles || []).some((r) =>
    (r.permissions || []).some((p) => p.name === permission)
  );
}

// Guard helper for API routes
/** @param {string | string[] | null} [permission] one permission, or an array meaning "any of these" */
export async function requireAuth(permission = null) {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, error: Response.json({ message: "Unauthenticated." }, { status: 401 }) };
  }
  if (isAdminEmail(user.email)) {
    return { user, error: null };
  }
  const needed = permission == null ? [] : Array.isArray(permission) ? permission : [permission];
  if (needed.length && !needed.some((p) => userCan(user, p))) {
    return { user, error: Response.json({ message: "Forbidden." }, { status: 403 }) };
  }
  return { user, error: null };
}
