import { NextRequest, NextResponse }       from "next/server";
import { z }                               from "zod";
import { prisma }                          from "@/lib/prisma";
import { requireRole }                     from "@/lib/auth";
import { requirePermission }               from "@/lib/permissions";
import { randomUUID }                      from "crypto";
import { runEngine, type EngineClass, type EngineSubject,
         type EngineConfig, type EnginePreferences } from "@/lib/ai/timetableEngine";
import { validateTimetable, type ValidatorSlot, type ValidatorSubjectRequirement,
         type ValidatorConfig, type ValidatorTeacherAvailability } from "@/lib/ai/timetableValidator";
import { optimizeTimetable }               from "@/lib/ai/timetableOptimizer";
import { buildAnalyticsReport, type SlotMeta } from "@/lib/ai/timetableAnalytics";
import type { ParsedConstraint }           from "@/lib/ai/constraintParser";

const schema = z.object({
  name:             z.string().trim().min(1).max(80).default("Generated draft"),
  description:      z.string().trim().max(300).optional(),
  academicYear:     z.string().trim().max(10).optional(),
  term:             z.number().int().min(1).max(4).nullable().optional(),
  classIds:         z.array(z.string()).optional(),
  replaceVersionId: z.string().optional(),
  /** Skip optimizer pass for speed (default: run optimizer). */
  skipOptimizer:    z.boolean().optional(),
  /** Skip AI analytics explanation (default: run it). */
  skipAiExplanation:z.boolean().optional(),
  /** Number of optimizer passes (1–8, default 4). */
  optimizerPasses:  z.number().int().min(1).max(8).optional(),
});

export async function POST(req: NextRequest) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const opts = body.data;

  // ── 1. Load all school data in one parallel batch ───────────────────────
  const [
    classesRaw, subjectsRaw, workloadRules,
    teacherSubjects, unavailabilityRows,
    configRow, constraintsRaw, pinnedRows,
    specialPeriods, operatingDays, teachersRaw,
  ] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId, ...(opts.classIds?.length ? { id: { in: opts.classIds } } : {}) },
      select: { id: true, name: true, form: true, stream: true },
    }),
    prisma.subject.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, code: true, name: true, applicableForms: true,
                lessonsPerWeek: true, doubleLesson: true, requiresSpecialRoom: true },
    }),
    prisma.$queryRaw<Array<{
      subjectId: string; form: number; lessonsPerWeek: number;
      doubleLesson: boolean; consecutiveDouble: boolean;
      requiresSpecialRoom: string | null; maxPerDay: number | null;
      minSpreadDays: number | null; preferMorning: boolean; preferAfternoon: boolean;
    }>>`SELECT "subjectId", form, "lessonsPerWeek", "doubleLesson", "consecutiveDouble",
             "requiresSpecialRoom", "maxPerDay", "minSpreadDays", "preferMorning", "preferAfternoon"
        FROM "SubjectWorkloadRule" WHERE "schoolId" = ${user.schoolId}`,
    prisma.teacherSubject.findMany({
      where: { subject: { schoolId: user.schoolId } },
      select: { subjectId: true, teacherId: true },
    }),
    prisma.teacherUnavailability.findMany({
      where: { teacher: { schoolId: user.schoolId } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    }),
    prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
    prisma.aiTimetableConstraint.findMany({ where: { schoolId: user.schoolId } }),
    prisma.classSubjectTeacher.findMany({
      where: { schoolClass: { schoolId: user.schoolId } },
      select: { classId: true, subjectId: true, teacherId: true },
    }),
    prisma.$queryRaw<Array<{ type: string; dayOfWeek: number | null; period: number; isActive: boolean }>>`
      SELECT type, "dayOfWeek", period, "isActive"
      FROM "SpecialPeriod" WHERE "schoolId" = ${user.schoolId} AND "isActive" = true`,
    prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`
      SELECT "dayOfWeek", "isActive" FROM "OperatingDay" WHERE "schoolId" = ${user.schoolId}`,
    prisma.teacher.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!classesRaw.length) return NextResponse.json({ error: "No classes to schedule." }, { status: 400 });

  // ── 2. Build engine inputs ──────────────────────────────────────────────
  const activeDays: number[] =
    operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek).length > 0
      ? operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek)
      : ((configRow as Record<string, unknown>)?.operatingDaysOfWeek as number[] | undefined) ?? [0,1,2,3,4];

  const blockedSlots = new Set<string>();
  for (const sp of specialPeriods) {
    if (sp.dayOfWeek !== null) blockedSlots.add(`${sp.dayOfWeek}-${sp.period}`);
    else activeDays.forEach((d) => blockedSlots.add(`${d}-${sp.period}`));
  }
  if (configRow?.gamesDayOfWeek != null && configRow?.gamesPeriod != null)
    blockedSlots.add(`${configRow.gamesDayOfWeek}-${configRow.gamesPeriod}`);

  const workloadMap = new Map(workloadRules.map((r) => [`${r.subjectId}-${r.form}`, r]));

  // Assign stream index per form for rotation
  const formStreamCount = new Map<number, number>();
  const streamIndexMap  = new Map<string, number>();
  for (const cls of classesRaw) {
    const idx = formStreamCount.get(cls.form) ?? 0;
    streamIndexMap.set(cls.id, idx);
    formStreamCount.set(cls.form, idx + 1);
  }

  const subjectsByClass = new Map<string, EngineSubject[]>();
  for (const cls of classesRaw) {
    const applicable = subjectsRaw.filter(
      (s) => !s.applicableForms.length || s.applicableForms.includes(cls.form)
    );
    subjectsByClass.set(cls.id, applicable.map((s) => {
      const rule = workloadMap.get(`${s.id}-${cls.form}`);
      return {
        id: s.id, code: s.code, name: s.name,
        lessonsPerWeek:      rule?.lessonsPerWeek      ?? s.lessonsPerWeek,
        doubleLesson:        rule?.doubleLesson         ?? s.doubleLesson,
        consecutiveDouble:   rule?.consecutiveDouble    ?? false,
        requiresSpecialRoom: rule?.requiresSpecialRoom  ?? s.requiresSpecialRoom,
        minSpreadDays:       rule?.minSpreadDays         ?? 1,
        preferMorning:       rule?.preferMorning         ?? false,
        preferAfternoon:     rule?.preferAfternoon       ?? false,
      } satisfies EngineSubject;
    }));
  }

  const teachersBySubject = new Map<string, string[]>();
  for (const ts of teacherSubjects) {
    if (!teachersBySubject.has(ts.subjectId)) teachersBySubject.set(ts.subjectId, []);
    teachersBySubject.get(ts.subjectId)!.push(ts.teacherId);
  }

  const unavailability = new Map<string, Set<string>>();
  for (const row of unavailabilityRows) {
    if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
    unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  if (opts.classIds?.length) {
    const regenIds  = new Set(classesRaw.map((c) => c.id));
    const otherSlots = await prisma.timetableSlot.findMany({
      where: { schoolId: user.schoolId, classId: { notIn: [...regenIds] } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    });
    for (const row of otherSlots) {
      if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
      unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
    }
  }

  const pinnedAssignments = new Map(pinnedRows.map((r) => [`${r.classId}-${r.subjectId}`, r.teacherId]));

  const preferences: EnginePreferences = { prioritized: new Map(), avoided: new Map(), maxLessonsPerDayOverride: null };
  for (const c of constraintsRaw) {
    const p = c.parsed as ParsedConstraint | null;
    if (!p) continue;
    if (p.kind === "PRIORITIZE_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd)
      preferences.prioritized.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    if (p.kind === "AVOID_SUBJECT_TIME"      && p.subjectCode && p.periodStart && p.periodEnd)
      preferences.avoided.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    if (p.kind === "MAX_LESSONS_PER_DAY"     && p.maxLessonsPerDay)
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

  const engineClasses: EngineClass[] = classesRaw.map((c) => ({
    id: c.id, name: c.name, form: c.form,
    streamIndex: streamIndexMap.get(c.id) ?? 0,
  }));

  // ── 3. Run engine ───────────────────────────────────────────────────────
  const engineResult = runEngine({
    classes: engineClasses, subjectsByClass, teachersBySubject,
    unavailability, pinnedAssignments, config: engineConfig, preferences,
  });

  // ── 4. Validate ─────────────────────────────────────────────────────────
  const teacherNameMap = new Map(teachersRaw.map((t) => [t.id, t.fullName]));
  const classNameMap   = new Map(classesRaw.map((c) => [c.id, c.name]));
  const subjectCodeMap = new Map(subjectsRaw.map((s) => [s.id, s.code]));

  const validatorSlots: ValidatorSlot[] = engineResult.slots.map((s) => ({
    classId:     s.classId,
    className:   classNameMap.get(s.classId) ?? s.classId,
    dayOfWeek:   s.dayOfWeek,
    period:      s.period,
    subjectId:   s.subjectId,
    subjectCode: subjectCodeMap.get(s.subjectId) ?? s.subjectId,
    teacherId:   s.teacherId,
    teacherName: teacherNameMap.get(s.teacherId) ?? s.teacherId,
    room:        s.room,
    isDouble:    s.isDouble,
  }));

  const requirements: ValidatorSubjectRequirement[] = [];
  for (const cls of classesRaw) {
    const subs = subjectsByClass.get(cls.id) ?? [];
    for (const s of subs) {
      if (s.lessonsPerWeek > 0)
        requirements.push({
          classId: cls.id, className: cls.name,
          subjectId: s.id, subjectCode: s.code, subjectName: s.name,
          lessonsPerWeek: s.lessonsPerWeek, doubleLesson: s.doubleLesson,
          minSpreadDays: s.minSpreadDays,
        });
    }
  }

  const validatorConfig: ValidatorConfig = {
    operatingDays:              activeDays,
    periodsPerDay:              engineConfig.periodsPerDay,
    blockedSlots:               engineConfig.blockedSlots,
    maxLessonsPerTeacherPerDay: engineConfig.maxLessonsPerTeacherPerDay,
    maxLessonsPerTeacherPerWeek:engineConfig.periodsPerDay * activeDays.length,
  };

  const validatorAvailability: ValidatorTeacherAvailability[] = [...unavailability.entries()]
    .map(([teacherId, unavailableSlots]) => ({ teacherId, unavailableSlots }));

  const validation = validateTimetable({
    slots: validatorSlots, requirements, config: validatorConfig, availability: validatorAvailability,
  });

  // ── 5. Optimize ─────────────────────────────────────────────────────────
  const reqMap = new Map<string, number>();
  for (const r of requirements) reqMap.set(`${r.classId}-${r.subjectId}`, r.lessonsPerWeek);

  let finalSlots = engineResult.slots;
  let optimizerSummary = {
    passesRun: 0, movesApplied: 0, conflictsResolved: 0,
    spreadImproved: 0, loadBalanced: 0, idleReduced: 0,
    qualityDelta: 0, remainingIssues: [] as string[],
  };

  if (!opts.skipOptimizer) {
    const optResult = optimizeTimetable({
      slots: engineResult.slots, config: engineConfig, preferences,
      unavailability, requirements: reqMap,
      targetClassIds: opts.classIds?.length ? new Set(opts.classIds) : undefined,
      maxPasses: opts.optimizerPasses ?? 4,
    });
    finalSlots       = optResult.slots;
    optimizerSummary = optResult.summary;
  }

  // ── 6. Build analytics ──────────────────────────────────────────────────
  const slotMeta = new Map<string, SlotMeta>();
  for (const s of finalSlots) {
    const key = `${s.classId}|${s.subjectId}`;
    if (!slotMeta.has(key)) {
      slotMeta.set(key, {
        classId:     s.classId,
        className:   classNameMap.get(s.classId)   ?? s.classId,
        teacherId:   s.teacherId,
        teacherName: teacherNameMap.get(s.teacherId) ?? s.teacherId,
        subjectId:   s.subjectId,
        subjectCode: subjectCodeMap.get(s.subjectId) ?? s.subjectId,
      });
    }
  }

  const analyticsReport = await buildAnalyticsReport({
    slots: finalSlots, slotMeta, engineResult, validation,
    optimizer: optimizerSummary,
    config: {
      periodsPerDay:              engineConfig.periodsPerDay,
      operatingDays:              activeDays,
      maxLessonsPerTeacherPerDay: engineConfig.maxLessonsPerTeacherPerDay,
    },
    schoolId:              user.schoolId,
    classCount:            classesRaw.length,
    generateAiExplanation: !opts.skipAiExplanation,
  });

  // ── 7. Persist draft version ────────────────────────────────────────────
  const versionId = opts.replaceVersionId ?? randomUUID();
  const now       = new Date();

  if (opts.replaceVersionId) {
    await prisma.$executeRaw`DELETE FROM "TimetableVersionSlot" WHERE "versionId" = ${versionId}`;
    await prisma.$executeRaw`
      UPDATE "TimetableVersion"
      SET name = ${opts.name}, description = ${opts.description ?? null},
          "academicYear" = ${opts.academicYear ?? null}, term = ${opts.term ?? null},
          "generatedAt" = ${now}, "updatedAt" = ${now}
      WHERE id = ${versionId} AND "schoolId" = ${user.schoolId}`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersion"
        (id, "schoolId", name, description, status, "academicYear", term,
         "generatedAt", "createdById", "createdAt", "updatedAt")
      VALUES (${versionId}, ${user.schoolId}, ${opts.name}, ${opts.description ?? null},
              'DRAFT', ${opts.academicYear ?? null}, ${opts.term ?? null},
              ${now}, ${user.id}, ${now}, ${now})`;
  }

  for (const s of finalSlots) {
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersionSlot"
        (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
         "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${versionId}, ${user.schoolId}, ${s.classId},
              ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
              ${s.room ?? null}, false, ${now}, ${now})
      ON CONFLICT ("versionId", "classId", "dayOfWeek", period) DO NOTHING`;
  }

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (${randomUUID()}, ${user.schoolId}, ${versionId},
            'GENERATED'::"TimetableChangeAction",
            ${JSON.stringify({
              slotCount: finalSlots.length,
              qualityScore: analyticsReport.overallQuality,
              errorCount: validation.errorCount,
              warningCount: validation.warningCount,
              movesApplied: optimizerSummary.movesApplied,
            })}::jsonb,
            ${user.id}, ${now})`;

  // ── 8. Response ─────────────────────────────────────────────────────────
  return NextResponse.json({
    versionId,
    name:        opts.name,
    slotCount:   finalSlots.length,
    qualityScore:analyticsReport.overallQuality,
    // Engine summary
    fullyPlaced:    engineResult.fullyPlaced,
    partiallyPlaced:engineResult.partiallyPlaced,
    notPlaced:      engineResult.notPlaced,
    warnings:       engineResult.warnings,
    // Full structured reports
    validation:  validation,
    optimizer:   optimizerSummary,
    analytics:   analyticsReport,
    // Preview slots
    slots: finalSlots.map((s) => ({
      classId:     s.classId,
      className:   classNameMap.get(s.classId)   ?? "",
      dayOfWeek:   s.dayOfWeek,
      period:      s.period,
      subjectId:   s.subjectId,
      subjectCode: subjectCodeMap.get(s.subjectId) ?? "",
      teacherId:   s.teacherId,
      teacherName: teacherNameMap.get(s.teacherId) ?? "",
      room:        s.room,
      isDouble:    s.isDouble,
    })),
  });
}
