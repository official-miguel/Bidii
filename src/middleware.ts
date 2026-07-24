import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "bidii_session";

/// Middleware runs on Edge (can't use Prisma). Only checks cookie presence.
/// Real auth + permission checks happen server-side in layouts via getCurrentUser().
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  const protectedPrefixes = [
    "/principal",
    "/teacher",
    "/staff",
    "/parent",
    "/results",
    "/assessments",
  ];

  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (!hasSession && isProtected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/principal/:path*",
    "/teacher/:path*",
    "/staff/:path*",
    "/parent/:path*",
    "/results/:path*",
    "/assessments/:path*",
  ],
};
