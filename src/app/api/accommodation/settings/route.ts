import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"))
  );
}
async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

const DEFAULT_SETTINGS = {
  boardingType: "DAY_AND_BOARDING",
  schoolGenderPolicy: "MIXED",
  enableDormCaptains: true,
  enableTransfers: true,
  defaultAllocationPolicy: "MIXED_FORMS",
  occupancyWarningPct: 90,
  bedTrackingEnabled: true,
  analyticsEnabled: true,
  notifyOnAllocation: false,
};

export async function GET() {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.accommodationSettings.findUnique({
    where: { schoolId: user.schoolId },
  });

  return NextResponse.json(settings ?? { ...DEFAULT_SETTINGS, updatedAt: null });
}

const updateSchema = z.object({
  boardingType: z.enum(["DAY_ONLY", "BOARDING_ONLY", "DAY_AND_BOARDING"]),
  schoolGenderPolicy: z.enum(["BOYS_ONLY", "GIRLS_ONLY", "MIXED"]),
  enableDormCaptains: z.boolean(),
  enableTransfers: z.boolean(),
  defaultAllocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]),
  occupancyWarningPct: z.coerce.number().int().min(50).max(100),
  bedTrackingEnabled: z.boolean(),
  analyticsEnabled: z.boolean(),
  notifyOnAllocation: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const settings = await prisma.accommodationSettings.upsert({
    where: { schoolId: user.schoolId },
    create: { schoolId: user.schoolId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json(settings);
}
