/**
 * POST /api/permissions/invalidate
 * Called after the Principal changes permissions to signal cache invalidation.
 * Body: { targetUserId?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const targetUserId = (body as { targetUserId?: string }).targetUserId;

  return NextResponse.json({
    invalidatedAt: new Date().toISOString(),
    scope:         targetUserId ? "user" : "school",
    schoolId:      auth.schoolId,
    targetUserId:  targetUserId ?? null,
  });
}
