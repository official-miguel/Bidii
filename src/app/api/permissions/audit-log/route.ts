/**
 * GET /api/permissions/audit-log
 * Returns the permission audit log for the current school. Principal only.
 * School isolation enforced — never returns another school's entries.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const url   = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.permissionAuditLog.findMany({
      where:   { schoolId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        performedBy: { select: { email: true } },
        targetUser:  { select: { email: true } },
      },
    }),
    prisma.permissionAuditLog.count({ where: { schoolId } }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
