import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const DEFAULTS = {
  periodsPerDay: 8,
  breakAfterPeriod: null as number | null,
  lunchAfterPeriod: null as number | null,
  gamesDayOfWeek: null as number | null,
  gamesPeriod: null as number | null,
  maxLessonsPerTeacherPerDay: 6,
  dayStartTime: "08:00",
  periodDurationMinutes: 40,
  breakDurationMinutes: 15,
  lunchDurationMinutes: 45,
};

export async function GET() {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } });
  return NextResponse.json(config ?? { schoolId: user.schoolId, ...DEFAULTS });
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const schema = z.object({
  periodsPerDay: z.number().int().min(4).max(12),
  breakAfterPeriod: z.number().int().min(1).nullable(),
  lunchAfterPeriod: z.number().int().min(1).nullable(),
  gamesDayOfWeek: z.number().int().min(0).max(4).nullable(),
  gamesPeriod: z.number().int().min(1).nullable(),
  maxLessonsPerTeacherPerDay: z.number().int().min(1).max(12),
  // The school's own timetable format — when the day starts and how long a
  // lesson/break/lunch run. Different schools run very different daily
  // shapes, so this is freeform per-school config rather than a fixed
  // assumption baked into the generator.
  dayStartTime: z.string().regex(TIME_RE, "Use 24-hour HH:MM, e.g. 08:00."),
  periodDurationMinutes: z.number().int().min(10).max(180),
  breakDurationMinutes: z.number().int().min(0).max(120),
  lunchDurationMinutes: z.number().int().min(0).max(180),
});

export async function PUT(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const config = await prisma.timetableConfig.upsert({
    where: { schoolId: user.schoolId },
    update: parsed.data,
    create: { schoolId: user.schoolId, ...parsed.data },
  });
  return NextResponse.json(config);
}
