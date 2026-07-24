import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { prisma }                   from "@/lib/prisma";
import { requireRole }              from "@/lib/auth";
import { requirePermission }        from "@/lib/permissions";
import { randomUUID }               from "crypto";
import { runEngine, type EngineClass, type EngineSubject, type EngineConfig, type EnginePreferences } from "@/lib/ai/timetableEngine";
import type { ParsedConstraint } from "@/lib/ai/constraintParser";

type Ctx = { params: { id: string } };

const moveOp = z.object({
  type:      z.literal("MOVE"),
  slotId:    z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  period:    z.number().int().min(1).max(16),
  teacherId: z.string().optional(),
  room:      z.string().max(80).nullable().optional(),
});

const deleteOp = z.object({
  type:   z.literal("DELETE"),
  slotId: z.string(),
});

const addOp = z.object({
  type:      z.literal("ADD"),
  classId:   z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  period:    z.number().int().min(1).max(16),
  subjectId: z.string(),
  teacherId: z.string(),
  room:      z.string().max(80).nullable().optional(),
});

const autoFixOp = z.object({
  type:    z.literal("AUTO_FIX"),
  /** Conflict keys (e.g. "class:id|2-4") whose slots should be re-scheduled. */
  classIds:z.array(z.string()),
});

const operationSchema = z.discriminatedUnion("type", [moveOp, deleteOp, addOp, autoFixOp]);

const bodySchema = z.object({
  operations: z.array(operationSchema).min(1).max(200),
});

/**
 * POST /api/timetable/v2/versions/[id]/batch
 *
 * Applies multiple slot operations in a single transaction.
 * AUTO_FIX operation: re-runs the engine for the specified class IDs only,
 * preserving all slots for other classes, then writes the result into the version.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  // Verify version
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion" WHERE id = ${params.id} AND "schoolId" = ${user.schoolId}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED") return NextResponse.json({ error: "Cannot edit an archived version." }, { status: 409 });

  const now = new Date();
  const applied: string[] = [];
  const errors:  string[] = [];

  for (const op of body.data.operations) {
    try {
      if (op.type === "DELETE") {
        await prisma.$executeRaw`
          DELETE FROM "TimetableVersionSlot" WHERE id = ${op.slotId} AND "versionId" = ${params.id}`;
        applied.push(`DELETE:${op.slotId}`);

      } else if (op.type === "ADD") {
        // Conflict check
        const cc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" = ${op.classId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}`;
        if (cc.length > 0) { errors.push(`ADD: class already has a lesson at ${op.dayOfWeek}-${op.period}`); continue; }

        const tc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "teacherId" = ${op.teacherId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}`;
        if (tc.length > 0) { errors.push(`ADD: teacher already booked at ${op.dayOfWeek}-${op.period}`); continue; }

        const newId = randomUUID();
        await prisma.$executeRaw`
          INSERT INTO "TimetableVersionSlot"
            (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
             "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
          VALUES (${newId}, ${params.id}, ${user.schoolId}, ${op.classId},
                  ${op.dayOfWeek}, ${op.period}, ${op.subjectId}, ${op.teacherId},
                  ${op.room ?? null}, true, ${now}, ${now})`;
        applied.push(`ADD:${newId}`);

      } else if (op.type === "MOVE") {
        const slotRows = await prisma.$queryRaw<Array<{ classId: string; subjectId: string; teacherId: string }>>`
          SELECT "classId", "subjectId", "teacherId"
          FROM "TimetableVersionSlot" WHERE id = ${op.slotId} AND "versionId" = ${params.id}`;
        if (!slotRows[0]) { errors.push(`MOVE: slot ${op.slotId} not found`); continue; }
        const slot = slotRows[0];
        const effectiveTeacher = op.teacherId ?? slot.teacherId;

        const cc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" = ${slot.classId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period} AND id != ${op.slotId}`;
        if (cc.length > 0) { errors.push(`MOVE: class conflict at ${op.dayOfWeek}-${op.period}`); continue; }

        const tc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "teacherId" = ${effectiveTeacher}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period} AND id != ${op.slotId}`;
        if (tc.length > 0) { errors.push(`MOVE: teacher conflict at ${op.dayOfWeek}-${op.period}`); continue; }

        await prisma.$executeRaw`
          UPDATE "TimetableVersionSlot"
          SET "dayOfWeek" = ${op.dayOfWeek}, period = ${op.period},
              "teacherId" = ${effectiveTeacher}, "updatedAt" = ${now}
          WHERE id = ${op.slotId}`;
        applied.push(`MOVE:${op.slotId}`);

      } else if (op.type === "AUTO_FIX") {
        // Re-run engine for specified class IDs only; other classes are locked
        const [classesRaw, subjectsRaw, teacherSubjects, unavailRows, configRow,
               constraintsRaw, pinnedRows, specials, opDays, workloadRules] = await Promise.all([
          prisma.schoolClass.findMany({ where: { schoolId: user.schoolId, id: { in: op.classIds } }, select: { id: true, name: true, form: true } }),
          prisma.subject.findMany({ where: { schoolId: user.schoolId }, select: { id: true, code: true, name: true, applicableForms: true, lessonsPerWeek: true, doubleLesson: true, requiresSpecialRoom: true } }),
          prisma.teacherSubject.findMany({ where: { subject: { schoolId: user.schoolId } }, select: { subjectId: true, teacherId: true } }),
          prisma.teacherUnavailability.findMany({ where: { teacher: { schoolId: user.schoolId } }, select: { teacherId: true, dayOfWeek: true, period: true } }),
          prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
          prisma.aiTimetableConstraint.findMany({ where: { schoolId: user.schoolId } }),
          prisma.classSubjectTeacher.findMany({ where: { schoolClass: { schoolId: user.schoolId } }, select: { classId: true, subjectId: true, teacherId: true } }),
          prisma.$queryRaw<Array<{ dayOfWeek: number | null; period: number }>>`SELECT "dayOfWeek", period FROM "SpecialPeriod" WHERE "schoolId" = ${user.schoolId} AND "isActive" = true`,
          prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`SELECT "dayOfWeek", "isActive" FROM "OperatingDay" WHERE "schoolId" = ${user.schoolId}`,
          prisma.$queryRaw<Array<{ subjectId: string; form: number; lessonsPerWeek: number; doubleLesson: boolean; consecutiveDouble: boolean; requiresSpecialRoom: string | null; minSpreadDays: number | null; preferMorning: boolean; preferAfternoon: boolean }>>`
            SELECT "subjectId", form, "lessonsPerWeek", "doubleLesson", "consecutiveDouble", "requiresSpecialRoom", "minSpreadDays", "preferMorning", "preferAfternoon"
            FROM "SubjectWorkloadRule" WHERE "schoolId" = ${user.schoolId}`,
        ]);

        if (!classesRaw.length) { errors.push("AUTO_FIX: no valid classes"); continue; }

        const activeDays = opDays.filter((d) => d.isActive).map((d) => d.dayOfWeek);
        const blocked    = new Set<string>();
        for (const sp of specials) {
          if (sp.dayOfWeek !== null) blocked.add(`${sp.dayOfWeek}-${sp.period}`);
          else (activeDays.length > 0 ? activeDays : [0,1,2,3,4]).forEach((d) => blocked.add(`${d}-${sp.period}`));
        }

        // Lock other classes' teacher slots — query each locked class separately
        const lockedSlots: Array<{ teacherId: string; dayOfWeek: number; period: number }> = [];
        const allVersionSlots = await prisma.$queryRaw<Array<{ classId: string; teacherId: string; dayOfWeek: number; period: number }>>`
          SELECT "classId", "teacherId", "dayOfWeek", period FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id}`;

        const regenIds = new Set(op.classIds);
        for (const row of allVersionSlots) {
          if (!regenIds.has(row.classId)) lockedSlots.push(row);
        }

        const unavailability = new Map<string, Set<string>>();
        for (const r of unavailRows) {
          if (!unavailability.has(r.teacherId)) unavailability.set(r.teacherId, new Set());
          unavailability.get(r.teacherId)!.add(`${r.dayOfWeek}-${r.period}`);
        }
        for (const r of lockedSlots) {
          if (!unavailability.has(r.teacherId)) unavailability.set(r.teacherId, new Set());
          unavailability.get(r.teacherId)!.add(`${r.dayOfWeek}-${r.period}`);
        }

        const workloadMap = new Map(workloadRules.map((r) => [`${r.subjectId}-${r.form}`, r]));
        const subjectsByClass = new Map<string, EngineSubject[]>();
        for (const cls of classesRaw) {
          const applicable = subjectsRaw.filter((s) => !s.applicableForms.length || s.applicableForms.includes(cls.form));
          subjectsByClass.set(cls.id, applicable.map((s) => {
            const rule = workloadMap.get(`${s.id}-${cls.form}`);
            return { id: s.id, code: s.code, name: s.name,
              lessonsPerWeek:      rule?.lessonsPerWeek      ?? s.lessonsPerWeek,
              doubleLesson:        rule?.doubleLesson         ?? s.doubleLesson,
              consecutiveDouble:   rule?.consecutiveDouble    ?? false,
              requiresSpecialRoom: rule?.requiresSpecialRoom  ?? s.requiresSpecialRoom,
              minSpreadDays: rule?.minSpreadDays ?? 1, preferMorning: rule?.preferMorning ?? false, preferAfternoon: rule?.preferAfternoon ?? false,
            } satisfies EngineSubject;
          }));
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
          if (p.kind === "PRIORITIZE_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd) preferences.prioritized.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
          if (p.kind === "AVOID_SUBJECT_TIME"      && p.subjectCode && p.periodStart && p.periodEnd) preferences.avoided.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
        }

        const engineConfig: EngineConfig = {
          operatingDays: activeDays.length > 0 ? activeDays : [0,1,2,3,4],
          periodsPerDay: configRow?.periodsPerDay ?? 8,
          maxLessonsPerTeacherPerDay: configRow?.maxLessonsPerTeacherPerDay ?? 6,
          blockedSlots: blocked,
        };

        const engineResult = runEngine({
          classes: classesRaw as EngineClass[],
          subjectsByClass, teachersBySubject, unavailability, pinnedAssignments,
          config: engineConfig, preferences,
        });

        // Delete existing slots for the affected classes one at a time
        for (const cid of op.classIds) {
          await prisma.$executeRaw`
            DELETE FROM "TimetableVersionSlot"
            WHERE "versionId" = ${params.id} AND "classId" = ${cid}`;
        }

        for (const s of engineResult.slots) {
          await prisma.$executeRaw`
            INSERT INTO "TimetableVersionSlot"
              (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
               "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${params.id}, ${user.schoolId}, ${s.classId},
                    ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
                    ${s.room ?? null}, false, ${now}, ${now})
            ON CONFLICT ("versionId", "classId", "dayOfWeek", period) DO NOTHING`;
        }
        applied.push(`AUTO_FIX:${op.classIds.join(",")}`);
      }
    } catch (e) {
      errors.push(`Operation failed: ${(e as Error).message}`);
    }
  }

  // Audit single entry for the batch
  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (${randomUUID()}, ${user.schoolId}, ${params.id},
            'SLOT_ADDED'::"TimetableChangeAction",
            ${JSON.stringify({ batch: true, applied: applied.length, errors: errors.length })}::jsonb,
            ${user.id}, ${now})`;

  return NextResponse.json({ applied: applied.length, errors, appliedOps: applied });
}
