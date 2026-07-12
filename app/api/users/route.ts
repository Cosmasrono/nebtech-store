// Admin-only user management. Middleware already restricts /api/users to the
// admin role; we re-check here as defense in depth.
import { NextResponse } from "next/server";
import * as repo from "@/lib/server/clinic-repo";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ users: await repo.listUsers() });
}

export async function POST(req: Request) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const result = await repo.createUser(body);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ users: await repo.listUsers() });
}

export async function PATCH(req: Request) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const result = await repo.updateUser(body);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ users: await repo.listUsers() });
}
