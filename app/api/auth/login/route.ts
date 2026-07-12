import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    const user = await prisma.user.findUnique({
      where: { username: String(username ?? "").trim() },
    });

    const ok =
      user &&
      user.active &&
      (await verifyPassword(String(password ?? ""), user.passwordHash));

    if (!ok || !user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = await signSession({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as Role,
    });

    const res = NextResponse.json({
      ok: true,
      user: { name: user.name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
