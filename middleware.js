import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
const PUBLIC_PATHS = ["/login", "/register", "/system/unavailable", "/system/subscription-expired"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Public API endpoints (auth + mpesa callback from Safaricom)
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/mpesa/callback")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("nebtech_session")?.value;
  let session = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      session = payload;
    } catch {}
  }

  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (pathname.startsWith("/api/")) {
    if (!session) return NextResponse.json({ message: "Unauthenticated." }, { status: 401 });
    return NextResponse.next();
  }

  if (!session && !isPublicPage && pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (session && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|manifest.json|sw.js).*)"],
};
