import { NextRequest, NextResponse }  from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireRole }                from "@/lib/auth";
import { requirePermission }          from "@/lib/permissions";
import { randomUUID }                 from "crypto";
import { optimizeTimetable }          from "@/lib/ai/timetableOptimizer";
import { validateTimetable,
         type ValidatorSlot,
         type ValidatorSubjectRequirement,
         type ValidatorTeacherAvailability } from "@/lib/ai/timetableValidator";
import type { EngineSlot, EngineConfig, EnginePreferences } from "@/lib/ai/timetableEngine";
import type { ParsedConstraint } from "@/lib/ai/constraintParser";

const schema = z.object({
  versionId:     z.string().min(1),
  /** Optimise only these classes; omit for full version. */
  targetClassIds:z.array(z.string()).optional(),
  maxPasses:     z.number().int().min(1).max(8).optional(),
  /** Re-persist optimized slots back into the version (default true). */
  persist:       z.boolean().optional(),
});

/**
 * POST /api/timetable/v2/optimize
 *
 * Runs the local-search optimizer over a saved DRAFT TimetableVersion and
 * optionally persists the improved slots back to the DB. Returns both the
 * OptimizationSummary and a post-optimization ValidationReport so the UI
 * can show exactly what improved.
 */
export async function POST(req: NextRequest) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { versionId, targetClassIds, maxPasses, persist = true } = body.data;

  // Verify version ownership and status
  const vRows = await prisma.$queryRaw<Array<{ status: string; schoolId: string }>>`
    SELECT status, "schoolId" FROM "TimetableVersion"
    WHERE id = ${versionId} AND "schoolId" = ${user.schoolId}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED")
    return NextResponse.json({ error: "Archived versions cannot be optimized." }, { status: 409 });

  // ── Load version slots ─────────────────────────────────────────────────
  type RawSlot = {
    id: string; classId: string; dayOfWeek: number; period: number;
    subjectId: string; subjectCode: string; teacherId: string; teacherName: string;
    className: string; room: string | null;
  };

  const rawSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s.id, s."classId", c.name AS "className",
           s."dayOfWeek", s.period, s."subjectId", sub.code AS "subjectCode",
           s."teacherId", t."fullName" AS "teacherName", s.room
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${versionId}`;

  if (!rawSlots.length)
    return NextResponse.json({ error: "No slots in this version to optimize." }, { status: 422 });

  // ── Load config ────────────────────────────────────────────────────────
  const [configRow, unavailRows, specialPeriods, operatingDays, constraintsRaw,
         classesRaw, subjectsRaw, workloadRules] = await Promise.all([
    prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
    prisma.teacherUnavailability.findMany({
      where: { teacher: { schoolId: user.schoolId } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    }),
    prisma.$queryRaw<Array<{ dayOfWeek: number | null; period: number }>>`
      SELECT "dayOfWeek", period FROM "SpecialPeriod"
      WHERE "schoolId" = ${user.schoolId} AND "isActive" = true`,
    prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`
      SELECT "dayOfWeek", "isActive" FROM "OperatingDay" WHERE "schoolId" = ${user.schoolId}`,
    prisma.aiTimetableConstraint.findMany({ where: { schoolId: user.schoolId } }),
    prisma.schoolClass.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, form: true } }),
    prisma.subject.findMany({ where: { schoolId: user.schoolId }, select: { id: true, code: true, lessonsPerWeek: true, doubleLesson: true, applicableForms: true } }),
    prisma.$queryRaw<Array<{ subjectId: string; form: number; lessonsPerWeek: number; minSpreadDays: number | null }>>`
      SELECT "subjectId", form, "lessonsPerWeek", "minSpreadDays"
      FROM "SubjectWorkloadRule" WHERE "schoolId" = ${user.schoolId}`,
  ]);

  const activeDays: number[] =
    operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek).length > 0
      ? operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek)
      : ((configRow as Record<string,unknown>)?.operatingDaysOfWeek as number[] | undefined) ?? [0,1,2,3,4];

  const blockedSlots = new Set<string>();
  for (const sp of specialPeriods) {
    if (sp.dayOfWeek !== null) blockedSlots.add(`${sp.dayOfWeek}-${sp.period}`);
    else activeDays.forEach((d) => blockedSlots.add(`${d}-${sp.period}`));
  }

  const unavailability = new Map<string, Set<string>>();
  for (const row of unavailRows) {
    if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
    unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  const preferences: EnginePreferences = { prioritized: new Map(), avoided: new Map(), maxLessonsPerDayOverride: null };
  for (const c of constraintsRaw) {
    const p = c.parsed as ParsedConstraint | null;
    if (!p) continue;
    if (p.kind === "PRIORITIZE_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd)
      preferences.prioritized.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    if (p.kind === "AVOID_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd)
      preferences.avoided.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    if (p.kind === "MAX_LESSONS_PER_DAY" && p.maxLessonsPerDay)
      preferences.maxLessonsPerDayOverride = preferences.maxLessonsPerDayOverride
        ? Math.min(preferences.maxLessonsPerDayOverride, p.maxLessonsPerDay)
        : p.maxLessonsPerDay;
  }

  const engineConfig: EngineConfig = {
    operatingDays:              activeDays,
    periodsPerDay:              configRow?.periodsPerDay              ?? 8,
    maxLessonsPerTeacherPerDay: configRow?.maxLessonsPerTeacherPerDay ?? 6,
    blockedSlots,
  };

  const engineSlots: EngineSlot[] = rawSlots.map((s) => ({
    classId: s.classId, dayOfWeek: s.dayOfWeek, period: s.period,
    subjectId: s.subjectId, teacherId: s.teacherId, room: s.room, isDouble: false,
  }));

  // Build requirements map
  const workloadMap = new Map(workloadRules.map((r) => [`${r.subjectId}-${r.form}`, r]));
  const reqMap = new Map<string, number>();
  for (const cls of classesRaw) {
    for (const s of subjectsRaw) {
      if (s.applicableForms.length && !s.applicableForms.includes(cls.form)) continue;
      const rule = workloadMap.get(`${s.id}-${cls.form}`);
      reqMap.set(`${cls.id}-${s.id}`, rule?.lessonsPerWeek ?? s.lessonsPerWeek);
    }
  }

  // ── Run optimizer ──────────────────────────────────────────────────────
  const { slots: optimizedSlots, summary } = optimizeTimetable({
    slots:          engineSlots,
    config:         engineConfig,
    preferences,
    unavailability,
    requirements:   reqMap,
    targetClassIds: targetClassIds?.length ? new Set(targetClassIds) : undefined,
    maxPasses:      maxPasses ?? 4,
  });

  // ── Post-optimization validation ───────────────────────────────────────
  const validatorSlots: ValidatorSlot[] = optimizedSlots.map((s) => ({
    classId:     s.classId,
    className:   rawSlots.find((r) => r.classId === s.classId)?.className ?? s.classId,
    dayOfWeek:   s.dayOfWeek, period: s.period,
    subjectId:   s.subjectId,
    subjectCode: rawSlots.find((r) => r.subjectId === s.subjectId)?.subjectCode ?? s.subjectId,
    teacherId:   s.teacherId,
    teacherName: rawSlots.find((r) => r.teacherId === s.teacherId)?.teacherName ?? s.teacherId,
    room:        s.room, isDouble: s.isDouble,
  }));

  const requirements: ValidatorSubjectRequirement[] = [];
  for (const cls of classesRaw) {
    for (const s of subjectsRaw) {
      if (s.applicableForms.length && !s.applicableForms.includes(cls.form)) continue;
      const rule = workloadMap.get(`${s.id}-${cls.form}`);
      requirements.push({
        classId: cls.id, className: cls.name,
        subjectId: s.id, subjectCode: s.code, subjectName: s.code,
        lessonsPerWeek: rule?.lessonsPerWeek ?? s.lessonsPerWeek,
        doubleLesson: s.doubleLesson, minSpreadDays: rule?.minSpreadDays ?? 1,
      });
    }
  }

  const validatorAvailability: ValidatorTeacherAvailability[] = [...unavailability.entries()]
    .map(([teacherId, unavailableSlots]) => ({ teacherId, unavailableSlots }));

  const validation = validateTimetable({
    slots: validatorSlots, requirements,
    config: { operatingDays: activeDays, periodsPerDay: engineConfig.periodsPerDay,
              blockedSlots, maxLessonsPerTeacherPerDay: engineConfig.maxLessonsPerTeacherPerDay },
    availability: validatorAvailability,
  });

  // ── Persist if requested ───────────────────────────────────────────────
  if (persist) {
    const now = new Date();

    // Build a mapping from (classId, dayOfWeek, period) → old slot id
    const slotIdMap = new Map<string, string>();
    for (const r of rawSlots)
      slotIdMap.set(`${r.classId}|${r.dayOfWeek}|${r.period}`, r.id);

    // For each optimized slot, upsert by its original slot id if we can find it
    for (const s of optimizedSlots) {
      const origId = slotIdMap.get(`${s.classId}|${s.dayOfWeek}|${s.period}`);
      if (origId) {
        // Slot stayed in place — no DB change needed
        continue;
      }
      // Slot moved — find its old id by subjectId+classId combo and update
      const oldSlot = rawSlots.find(
        (r) => r.classId === s.classId && r.subjectId === s.subjectId &&
               !(r.dayOfWeek === s.dayOfWeek && r.period === s.period)
      );
      if (oldSlot) {
        await prisma.$executeRaw`
          UPDATE "TimetableVersionSlot"
          SET "dayOfWeek" = ${s.dayOfWeek}, period = ${s.period}, "updatedAt" = ${now}
          WHERE id = ${oldSlot.id}`;
      }
    }

    await prisma.$executeRaw`
      INSERT INTO "TimetableChangeLog"
        (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
      VALUES (${randomUUID()}, ${user.schoolId}, ${versionId},
              'GENERATED'::"TimetableChangeAction",
              ${JSON.stringify({ optimized: true, movesApplied: summary.movesApplied })}::jsonb,
              ${user.id}, ${now})`;
  }

  return NextResponse.json({ summary, validation });
}
