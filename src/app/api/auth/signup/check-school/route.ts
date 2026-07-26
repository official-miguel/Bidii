/**
 * GET /api/auth/signup/check-school?email=...
 * Public endpoint (no auth required) — checks whether a school email
 * already exists in the system and whether it has an active Principal.
 * Used by the signup form for live feedback before form submission.
 *
 * Returns:
 *   { exists: false }
 *   { exists: true, schoolName: string, activePrincipal: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ exists: false });
  }

  const school = await prisma.school.findFirst({
    where:  { email },
    select: { id: true, name: true },
  }).catch(() => null);

  if (!school) {
    return NextResponse.json({ exists: false });
  }

  const activePrincipal = await prisma.user.findFirst({
    where:  { schoolId: school.id, role: "PRINCIPAL", isActive: true },
    select: { id: true },
  }).catch(() => null);

  return NextResponse.json({
    exists:          true,
    schoolName:      school.name,
    activePrincipal: !!activePrincipal,
  });
}
