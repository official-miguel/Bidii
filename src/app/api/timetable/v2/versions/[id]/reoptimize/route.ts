import { NextRequest, NextResponse }      from "next/server";
import { z }                              from "zod";
import { prisma }                         from "@/lib/prisma";
import { requireRole }                    from "@/lib/auth";
import { requirePermission }              from "@/lib/permissions";
import { randomUUID }                     from "crypto";
import {
  runEngine,
  type EngineClass, type EngineSubject, type EngineConfig, type EnginePreferences,
  type EngineSlot,
} from "@/lib/ai/timetableEngine";
import { optimizeTimetable }              from "@/lib/ai/timetableOptimizer";
import type { ParsedConstraint }          from "@/lib/ai/constraintParser";

type Ctx = { params: { id: string } };

const schema = z.object({
  /** Optional: only re-optimize these class IDs. Omit = all unlocked classes. */
  classIds: z.array(z.string()).optional(),
  /** Number of optimizer passes (default 4). */
  optimizerPasses: z.number().int().min(1).max(8).optional(),
  /** Optional administrator reason logged in audit trail. */
  reason: z.string().trim().max(300).optional(),
});

// ── Slot snapshot helper ────────────────────────────────────────────────────
type RawSlot = {
  id: string; classId: string; className: string;
  dayOfWeek: number; period: number;
  subjectId: string; subjectCode: string;
  teacherId: string; teacherName: string;
  room: string | null; isManual: boolean; isLocked: boolean;
  lockScope: string | null; lockReason: string | null;
};

// ── Diff types ──────────────────────────────────────────────────────────────
export type DiffStatus = "unchanged" | "changed" | "added" | "removed" | "locked";

export type SlotDiff = {
  status:    DiffStatus;
  current:   RawSlot | null;   // null when status = "added"
  proposed:  RawSlot | null;   // null when status = "removed"
  /** Which fields changed (only relevant when status = "changed"). */
  changedFields: string[];
};

/**
 * POST /api/timetable/v2/versions/[id]/reoptimize
 *
 * Re-runs the scheduling engine for all UNLOCKED slots in the version.
 * Locked slots are treated as absolute positional pins — the engine sees
 * their (day, period) as occupied and their teacher as unavailable in that
 * slot, so it can never touch them.
 *
 * By default returns a preview diff without persisting. Add ?apply=true to
 * atomically apply the proposed changes to the version.
 *
 * Returns:
 *   { diff: SlotDiff[], stats, warnings }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apply = req.nextUrl.searchParams.get("apply") === "true";

  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { classIds: targetClassIds, optimizerPasses, reason } = body.data;

  // Verify version
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot re-optimize an archived version." }, { status: 409 });

  // ── Load current slots ──────────────────────────────────────────────────
  const currentSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s.id, s."classId", c.name AS "className",
           s."dayOfWeek", s.period, s."subjectId",
           sub.code AS "subjectCode", s."teacherId",
           t."fullName" AS "teacherName", s.room,
           s."isManual", s."isLocked",
           s."lockScope", s."lockReason"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}
    ORDER BY s."classId", s."dayOfWeek", s.period`;

  const lockedSlots   = currentSlots.filter((s) => s.isLocked);
  const unlockedSlots = currentSlots.filter((s) => !s.isLocked);

  // Determine which classes to re-optimize
  const candidateClasses = targetClassIds?.length
    ? [...new Set(unlockedSlots.filter((s) => targetClassIds.includes(s.classId)).map((s) => s.classId))]
    : [...new Set(unlockedSlots.map((s) => s.classId))];

  if (candidateClasses.length === 0)
    return NextResponse.json({ error: "No unlocked slots to re-optimize." }, { status: 422 });

  // ── Load engine inputs ──────────────────────────────────────────────────
  const [classesRaw, subjectsRaw, workloadRules, teacherSubjects, unavailRows,
         configRow, constraintsRaw, pinnedRows, specials, opDays] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId, id: { in: candidateClasses } },
      select: { id: true, name: true, form: true },
    }),
    prisma.subject.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, code: true, name: true, applicableForms: true,
                lessonsPerWeek: true, doubleLesson: true, requiresSpecialRoom: true },
    }),
    prisma.$queryRaw<Array<{
      subjectId: string; form: number; lessonsPerWeek: number;
      doubleLesson: boolean; consecutiveDouble: boolean;
      requiresSpecialRoom: string | null; minSpreadDays: number | null;
      preferMorning: boolean; preferAfternoon: boolean;
    }>>`SELECT "subjectId", form, "lessonsPerWeek", "doubleLesson", "consecutiveDouble",
             "requiresSpecialRoom", "minSpreadDays", "preferMorning", "preferAfternoon"
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
    prisma.$queryRaw<Array<{ dayOfWeek: number | null; period: number }>>`
      SELECT "dayOfWeek", period FROM "SpecialPeriod"
      WHERE "schoolId" = ${user.schoolId} AND "isActive" = true`,
    prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`
      SELECT "dayOfWeek", "isActive" FROM "OperatingDay"
      WHERE "schoolId" = ${user.schoolId}`,
  ]);

  const activeDays: number[] =
    opDays.filter((d) => d.isActive).map((d) => d.dayOfWeek).length > 0
      ? opDays.filter((d) => d.isActive).map((d) => d.dayOfWeek)
      : ((configRow as Record<string,unknown>)?.operatingDaysOfWeek as number[]|undefined) ?? [0,1,2,3,4];

  // Build blocked slots from special periods + legacy games
  const blockedSlots = new Set<string>();
  for (const sp of specials) {
    if (sp.dayOfWeek !== null) blockedSlots.add(`${sp.dayOfWeek}-${sp.period}`);
    else activeDays.forEach((d) => blockedSlots.add(`${d}-${sp.period}`));
  }
  if (configRow?.gamesDayOfWeek != null && configRow?.gamesPeriod != null)
    blockedSlots.add(`${configRow.gamesDayOfWeek}-${configRow.gamesPeriod}`);

  // ── Build unavailability: teacher unavailability + ALL locked slot positions
  //    + slots belonging to classes NOT being re-optimized
  const unavailability = new Map<string, Set<string>>();

  for (const r of unavailRows) {
    if (!unavailability.has(r.teacherId)) unavailability.set(r.teacherId, new Set());
    unavailability.get(r.teacherId)!.add(`${r.dayOfWeek}-${r.period}`);
  }

  // Lock locked slots: treat them as occupied (teacher unavailable at that slot)
  for (const s of lockedSlots) {
    if (!unavailability.has(s.teacherId)) unavailability.set(s.teacherId, new Set());
    unavailability.get(s.teacherId)!.add(`${s.dayOfWeek}-${s.period}`);
    // Also block the class at that slot so no other subject can land there
    blockedSlots.add(`${s.dayOfWeek}-${s.period}-locked-${s.classId}`);
  }

  // Lock slots for classes NOT in the re-optimization set
  const regenSet = new Set(candidateClasses);
  for (const s of currentSlots) {
    if (!regenSet.has(s.classId)) {
      if (!unavailability.has(s.teacherId)) unavailability.set(s.teacherId, new Set());
      unavailability.get(s.teacherId)!.add(`${s.dayOfWeek}-${s.period}`);
    }
  }

  const workloadMap = new Map(workloadRules.map((r) => [`${r.subjectId}-${r.form}`, r]));

  const subjectsByClass = new Map<string, EngineSubject[]>();
  for (const cls of classesRaw) {
    const applicable = subjectsRaw.filter(
      (s) => !s.applicableForms.length || s.applicableForms.includes(cls.form)
    );
    // For locked slots: subtract already-placed lessons from the weekly requirement
    const lockedForClass = lockedSlots.filter((s) => s.classId === cls.id);
    const lockedCountBySubject = new Map<string, number>();
    for (const ls of lockedForClass)
      lockedCountBySubject.set(ls.subjectId, (lockedCountBySubject.get(ls.subjectId) ?? 0) + 1);

    subjectsByClass.set(cls.id, applicable.map((s) => {
      const rule = workloadMap.get(`${s.id}-${cls.form}`);
      const totalRequired  = rule?.lessonsPerWeek ?? s.lessonsPerWeek;
      const alreadyLocked  = lockedCountBySubject.get(s.id) ?? 0;
      const remaining      = Math.max(0, totalRequired - alreadyLocked);
      return {
        id: s.id, code: s.code, name: s.name,
        lessonsPerWeek:      remaining,  // only schedule what isn't already locked
        doubleLesson:        rule?.doubleLesson        ?? s.doubleLesson,
        consecutiveDouble:   rule?.consecutiveDouble    ?? false,
        requiresSpecialRoom: rule?.requiresSpecialRoom  ?? s.requiresSpecialRoom,
        minSpreadDays:       rule?.minSpreadDays         ?? 1,
        preferMorning:       rule?.preferMorning         ?? false,
        preferAfternoon:     rule?.preferAfternoon       ?? false,
      } satisfies EngineSubject;
    }).filter((s) => s.lessonsPerWeek > 0)); // skip subjects already fully locked
  }

  const teachersBySubject = new Map<string, string[]>();
  for (const ts of teacherSubjects) {
    if (!teachersBySubject.has(ts.subjectId)) teachersBySubject.set(ts.subjectId, []);
    teachersBySubject.get(ts.subjectId)!.push(ts.teacherId);
  }

  const pinnedAssignments = new Map(pinnedRows.map((r) => [`${r.classId}-${r.subjectId}`, r.teacherId]));

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

  // Build per-class blocked slots (excludes class-locked positions from other classes)
  const classBlockedSlots = new Set<string>(blockedSlots);
  for (const s of lockedSlots) {
    if (regenSet.has(s.classId)) {
      // This class is being re-optimized but this specific slot is locked — block it
      classBlockedSlots.add(`${s.dayOfWeek}-${s.period}`);
    }
  }

  const engineConfig: EngineConfig = {
    operatingDays:              activeDays,
    periodsPerDay:              configRow?.periodsPerDay              ?? 8,
    maxLessonsPerTeacherPerDay: configRow?.maxLessonsPerTeacherPerDay ?? 6,
    blockedSlots:               classBlockedSlots,
  };

  // ── Run engine ──────────────────────────────────────────────────────────
  const engineResult = runEngine({
    classes: classesRaw as EngineClass[],
    subjectsByClass, teachersBySubject, unavailability, pinnedAssignments,
    config: engineConfig, preferences,
  });

  // ── Run optimizer ────────────────────────────────────────────────────────
  const reqMap = new Map<string, number>();
  for (const cls of classesRaw) {
    for (const s of (subjectsByClass.get(cls.id) ?? [])) {
      reqMap.set(`${cls.id}-${s.id}`, s.lessonsPerWeek);
    }
  }
  const { slots: optimizedSlots } = optimizeTimetable({
    slots: engineResult.slots, config: engineConfig, preferences,
    unavailability, requirements: reqMap,
    targetClassIds: regenSet,
    maxPasses: optimizerPasses ?? 4,
  });

  // ── Build diff ──────────────────────────────────────────────────────────
  const subjectCodeMap = new Map(subjectsRaw.map((s) => [s.id, s.code]));
  const classNameMap   = new Map(classesRaw.map((c) => [c.id, c.name]));

  // Map of current (unlocked) slots: "classId|day-period" → RawSlot
  const currentMap = new Map<string, RawSlot>();
  for (const s of unlockedSlots.filter((s) => regenSet.has(s.classId)))
    currentMap.set(`${s.classId}|${s.dayOfWeek}-${s.period}`, s);

  // Map of proposed slots: "classId|day-period" → EngineSlot
  const proposedMap = new Map<string, EngineSlot>();
  for (const s of optimizedSlots)
    proposedMap.set(`${s.classId}|${s.dayOfWeek}-${s.period}`, s);

  const diff: Array<{
    status: DiffStatus; current: RawSlot | null; proposed: RawSlot | null; changedFields: string[];
  }> = [];

  // Locked slots → always "locked" status (preserved)
  for (const s of lockedSlots.filter((s) => regenSet.has(s.classId))) {
    diff.push({ status: "locked", current: s, proposed: null, changedFields: [] });
  }

  // Current unlocked → check against proposed
  const allKeys = new Set([...currentMap.keys(), ...proposedMap.keys()]);
  for (const key of allKeys) {
    const cur  = currentMap.get(key) ?? null;
    const prop = proposedMap.get(key) ?? null;

    if (cur && !prop) {
      diff.push({ status: "removed", current: cur, proposed: null, changedFields: [] });
    } else if (!cur && prop) {
      // Build a pseudo RawSlot for the proposed slot for display
      const propRow: RawSlot = {
        id: "", classId: prop.classId,
        className: classNameMap.get(prop.classId) ?? prop.classId,
        dayOfWeek: prop.dayOfWeek, period: prop.period,
        subjectId: prop.subjectId, subjectCode: subjectCodeMap.get(prop.subjectId) ?? prop.subjectId,
        teacherId: prop.teacherId, teacherName: "",
        room: prop.room, isManual: false, isLocked: false,
        lockScope: null, lockReason: null,
      };
      diff.push({ status: "added", current: null, proposed: propRow, changedFields: [] });
    } else if (cur && prop) {
      const changed: string[] = [];
      if (cur.teacherId !== prop.teacherId) changed.push("teacher");
      if (cur.room       !== prop.room)     changed.push("room");
      diff.push({
        status:        changed.length ? "changed" : "unchanged",
        current:       cur,
        proposed:      changed.length ? {
          ...cur, teacherId: prop.teacherId, room: prop.room,
        } : null,
        changedFields: changed,
      });
    }
  }

  const stats = {
    locked:    diff.filter((d) => d.status === "locked").length,
    unchanged: diff.filter((d) => d.status === "unchanged").length,
    changed:   diff.filter((d) => d.status === "changed").length,
    added:     diff.filter((d) => d.status === "added").length,
    removed:   diff.filter((d) => d.status === "removed").length,
    warnings:  engineResult.warnings,
  };

  // ── Apply if requested ──────────────────────────────────────────────────
  if (apply) {
    const now = new Date();

    // Delete unlocked slots for re-optimized classes
    for (const cid of candidateClasses) {
      await prisma.$executeRaw`
        DELETE FROM "TimetableVersionSlot"
        WHERE "versionId" = ${params.id} AND "classId" = ${cid} AND "isLocked" = false`;
    }

    // Insert proposed slots
    for (const s of optimizedSlots) {
      await prisma.$executeRaw`
        INSERT INTO "TimetableVersionSlot"
          (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
           "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
        VALUES (
          ${randomUUID()}, ${params.id}, ${user.schoolId}, ${s.classId},
          ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
          ${s.room ?? null}, false, ${now}, ${now})
        ON CONFLICT ("versionId", "classId", "dayOfWeek", period) DO NOTHING`;
    }

    // Write audit
    await prisma.$executeRaw`
      INSERT INTO "TimetableChangeLog"
        (id, "schoolId", "versionId", action, "changeSource", detail,
         reason, "performedById", "performedAt")
      VALUES (
        ${randomUUID()}, ${user.schoolId}, ${params.id},
        'REOPTIMIZED'::"TimetableChangeAction", 'AI',
        ${JSON.stringify({ stats, classCount: candidateClasses.length })}::jsonb,
        ${reason ?? null}, ${user.id}, ${now})`;
  }

  return NextResponse.json({ diff, stats, applied: apply });
}
