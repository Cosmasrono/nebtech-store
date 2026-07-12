// First-run setup. GET tells the login screen whether any account exists yet;
// POST creates the first admin and logs them straight in.
import { NextResponse } from "next/server";
import * as repo from "@/lib/server/clinic-repo";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const count = await repo.userCount();
  return NextResponse.json({ needsSetup: count === 0 });
}

export async function POST(req: Request) {
  const body = await req.json();
  const result = await repo.bootstrapAdmin(body);
  if ("error" in result) {
    return NextResponse.json(result, { status: 409 });
  }
  const u = result.user;
  const token = await signSession({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as Role,
  });
  const res = NextResponse.json({ ok: true, user: { name: u.name, role: u.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
