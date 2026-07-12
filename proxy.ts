// Route protection. Runs on every request (except static assets). Verifies the
// session cookie and enforces role-based access; redirects appropriately.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { canAccess, homeForRole } from "@/lib/auth/roles";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public pages: the landing page, plus auth endpoints (login / logout) and
  // the M-Pesa callback, which Safaricom posts to without any session.
  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/mpesa/callback"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const isApi = pathname.startsWith("/api");
  const isLogin = pathname === "/login";

  // Not logged in.
  if (!session) {
    if (isLogin) return NextResponse.next();
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Logged in but on the login page -> send to their home.
  if (isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = homeForRole(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isApi) {
    // Only admins may touch user management.
    if (pathname.startsWith("/api/users") && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Payments are initiated at the pharmacy POS only.
    if (
      pathname.startsWith("/api/mpesa") &&
      !["pharmacist", "admin"].includes(session.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Page access by role.
  if (!canAccess(session.role, pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = homeForRole(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static image assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
