import { NextRequest, NextResponse }       from "next/server";
import { prisma }                          from "@/lib/prisma";
import { requireRole }                     from "@/lib/auth";
import { requirePermission }               from "@/lib/permissions";
import { validateTimetable,
         type ValidatorSlot,
         type ValidatorSubjectRequirement,
         type ValidatorConfig,
         type ValidatorTeacherAvailability } from "@/lib/ai/timetableValidator";

/**
 * GET /api/timetable/v2/validate?versionId=...
 *
 * Runs all 8 validation passes against a saved TimetableVersion and returns
 * the full ValidationReport. If versionId is omitted, validates the live
 * published timetable (legacy TimetableSlot rows).
 *
 * Used by the generate page "Validate before publish" button and any future
 * pre-publish gate.
 */
export async function GET(req: NextRequest) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versionId = req.nextUrl.searchParams.get("versionId");

  // ── Load slots ──────────────────────────────────────────────────────────
  type RawSlot = {
    classId: string; className: string; dayOfWeek: number; period: number;
    subjectId: string; subjectCode: string; teacherId: string; teacherName: string;
    room: string | null; isDouble?: boolean;
  };

  let rawSlots: RawSlot[];

  if (versionId) {
    // Verify version belongs to this school
    const versionRows = await prisma.$queryRaw<Array<{ schoolId: string }>>`
      SELECT "schoolId" FROM "TimetableVersion"
      WHERE id = ${versionId} AND "schoolId" = ${user.schoolId}`;
    if (!versionRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });

    rawSlots = await prisma.$queryRaw<RawSlot[]>`
      SELECT s."classId", c.name AS "className", s."dayOfWeek", s.period,
             s."subjectId", sub.code AS "subjectCode",
             s."teacherId", t."fullName" AS "teacherName",
             s.room, s."isManual" AS "isDouble"
      FROM "TimetableVersionSlot" s
      JOIN "SchoolClass" c   ON c.id = s."classId"
      JOIN "Subject"     sub ON sub.id = s."subjectId"
      JOIN "Teacher"     t   ON t.id = s."teacherId"
      WHERE s."versionId" = ${versionId}`;
  } else {
    rawSlots = await prisma.$queryRaw<RawSlot[]>`
      SELECT ts."classId", c.name AS "className", ts."dayOfWeek", ts.period,
             ts."subjectId", sub.code AS "subjectCode",
             ts."teacherId", t."fullName" AS "teacherName",
             ts.room, false AS "isDouble"
      FROM "TimetableSlot" ts
      JOIN "SchoolClass" c   ON c.id = ts."classId"
      JOIN "Subject"     sub ON sub.id = ts."subjectId"
      JOIN "Teacher"     t   ON t.id = ts."teacherId"
      WHERE ts."schoolId" = ${user.schoolId}`;
  }

  if (!rawSlots.length) {
    return NextResponse.json({ error: "No slots to validate — timetable is empty." }, { status: 422 });
  }

  // ── Load config and requirements ────────────────────────────────────────
  const [configRow, subjects, classesRaw, unavailRows, specialPeriods, operatingDays, workloadRules] =
    await Promise.all([
      prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
      prisma.subject.findMany({
        where: { schoolId: user.schoolId },
        select: { id: true, code: true, name: true, applicableForms: true, lessonsPerWeek: true, doubleLesson: true },
      }),
      prisma.schoolClass.findMany({
        where: { schoolId: user.schoolId },
        select: { id: true, name: true, form: true },
      }),
      prisma.teacherUnavailability.findMany({
        where: { teacher: { schoolId: user.schoolId } },
        select: { teacherId: true, dayOfWeek: true, period: true },
      }),
      prisma.$queryRaw<Array<{ dayOfWeek: number | null; period: number; isActive: boolean }>>`
        SELECT "dayOfWeek", period, "isActive"
        FROM "SpecialPeriod" WHERE "schoolId" = ${user.schoolId} AND "isActive" = true`,
      prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`
        SELECT "dayOfWeek", "isActive" FROM "OperatingDay" WHERE "schoolId" = ${user.schoolId}`,
      prisma.$queryRaw<Array<{
        subjectId: string; form: number; lessonsPerWeek: number;
        doubleLesson: boolean; minSpreadDays: number | null;
      }>>`SELECT "subjectId", form, "lessonsPerWeek", "doubleLesson", "minSpreadDays"
          FROM "SubjectWorkloadRule" WHERE "schoolId" = ${user.schoolId}`,
    ]);

  const activeDays: number[] =
    operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek).length > 0
      ? operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek)
      : [0, 1, 2, 3, 4];

  const blockedSlots = new Set<string>();
  for (const sp of specialPeriods) {
    if (sp.dayOfWeek !== null) blockedSlots.add(`${sp.dayOfWeek}-${sp.period}`);
    else activeDays.forEach((d) => blockedSlots.add(`${d}-${sp.period}`));
  }
  if (configRow?.gamesDayOfWeek != null && configRow?.gamesPeriod != null)
    blockedSlots.add(`${configRow.gamesDayOfWeek}-${configRow.gamesPeriod}`);

  const workloadMap = new Map(workloadRules.map((r) => [`${r.subjectId}-${r.form}`, r]));

  const requirements: ValidatorSubjectRequirement[] = [];
  for (const cls of classesRaw) {
    for (const s of subjects) {
      if (s.applicableForms.length && !s.applicableForms.includes(cls.form)) continue;
      const rule = workloadMap.get(`${s.id}-${cls.form}`);
      requirements.push({
        classId: cls.id, className: cls.name,
        subjectId: s.id, subjectCode: s.code, subjectName: s.name,
        lessonsPerWeek: rule?.lessonsPerWeek ?? s.lessonsPerWeek,
        doubleLesson:   rule?.doubleLesson   ?? s.doubleLesson,
        minSpreadDays:  rule?.minSpreadDays  ?? 1,
      });
    }
  }

  const unavailability = new Map<string, Set<string>>();
  for (const row of unavailRows) {
    if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
    unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  const validatorSlots: ValidatorSlot[] = rawSlots.map((s) => ({ ...s, isDouble: s.isDouble ?? false }));

  const validatorConfig: ValidatorConfig = {
    operatingDays:              activeDays,
    periodsPerDay:              configRow?.periodsPerDay              ?? 8,
    blockedSlots,
    maxLessonsPerTeacherPerDay: configRow?.maxLessonsPerTeacherPerDay ?? 6,
  };

  const availability: ValidatorTeacherAvailability[] = [...unavailability.entries()]
    .map(([teacherId, unavailableSlots]) => ({ teacherId, unavailableSlots }));

  const report = validateTimetable({ slots: validatorSlots, requirements, config: validatorConfig, availability });
  return NextResponse.json(report);
}
