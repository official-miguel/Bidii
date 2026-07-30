/**
 * API Route: GET /api/timetable/v2/versions/[id]/conflicts
 *
 * Runs the live conflict detector against a specific version's slots
 * and returns the full conflict map. Used by the builder UI on load
 * and after batch operations to check the current state server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  detectLiveConflicts,
  type LiveSlot,
  type ConflictEngineConfig,
} from "@/lib/timetable/liveConflictDetector";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;

  // Verify version ownership
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${schoolId}`;

  if (!vRows[0]) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Load all slots with display metadata
  type RawSlot = {
    id: string;
    classId: string;
    className: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    teacherId: string;
    teacherName: string;
    room: string | null;
    isManual: boolean;
    isLocked: boolean;
  };

  const rawSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s.id, s."classId", c.name AS "className",
           s."dayOfWeek", s.period,
           s."subjectId", sub.code AS "subjectCode",
           s."teacherId", t."fullName" AS "teacherName",
           s.room, s."isManual", s."isLocked"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}`;

  if (rawSlots.length === 0) {
    return NextResponse.json({
      totalErrors: 0,
      totalWarnings: 0,
      conflictList: [],
      conflictMapEntries: [],
    });
  }

  // Load config and unavailability
  const [config, unavailRows, requirements] = await Promise.all([
    prisma.timetableConfig.findUnique({
      where: { schoolId },
      include: { columns: { orderBy: { position: "asc" } } },
    }),
    prisma.teacherUnavailability.findMany({
      where: { teacher: { schoolId } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    }),
    prisma.subjectLessonRequirement.findMany({
      where: { schoolId },
      select: { classId: true, subjectId: true, lessonsPerWeek: true },
    }),
  ]);

  const operatingDays = config?.operatingDays ?? [0, 1, 2, 3, 4];

  // Count lesson-only columns for periodsPerDay
  const lessonCols = (config?.columns ?? []).filter((c) => c.slotType === "LESSON");

  // Build unavailability map
  const unavailabilityMap = new Map<string, Set<string>>();
  for (const row of unavailRows) {
    if (!unavailabilityMap.has(row.teacherId)) {
      unavailabilityMap.set(row.teacherId, new Set());
    }
    unavailabilityMap.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  // Build required lessons map
  const requiredLessons = new Map<string, number>();
  for (const req of requirements) {
    requiredLessons.set(`${req.classId}-${req.subjectId}`, req.lessonsPerWeek);
  }

  // Build double subjects set (from requirement implies doubleLesson subjects)
  const doubleSubjectsRaw = await prisma.subject.findMany({
    where: { schoolId, doubleLesson: true },
    select: { id: true },
  });

  // Need class context to build "classId-subjectId" keys for doubleSubjects
  const classIds = [...new Set(rawSlots.map((s) => s.classId))];
  const doubleSubjectIds = new Set(doubleSubjectsRaw.map((s) => s.id));
  const doubleSubjects = new Set<string>();
  for (const slot of rawSlots) {
    if (doubleSubjectIds.has(slot.subjectId)) {
      doubleSubjects.add(`${slot.classId}-${slot.subjectId}`);
    }
  }

  const liveSlots: LiveSlot[] = rawSlots.map((s) => ({
    id: s.id,
    classId: s.classId,
    className: s.className,
    dayOfWeek: s.dayOfWeek,
    period: s.period,
    subjectId: s.subjectId,
    subjectCode: s.subjectCode,
    teacherId: s.teacherId,
    teacherName: s.teacherName,
    room: s.room,
    isDouble: doubleSubjectIds.has(s.subjectId),
    isManual: s.isManual,
    isLocked: s.isLocked,
  }));

  const engineConfig: ConflictEngineConfig = {
    operatingDays,
    periodsPerDay: lessonCols.length,
    blockedSlots: new Set<string>(),
    maxLessonsPerTeacherPerDay: config?.maxLessonsPerTeacherPerDay ?? 6,
    teacherUnavailability: unavailabilityMap,
    requiredLessons,
    doubleSubjects,
  };

  const result = detectLiveConflicts(liveSlots, engineConfig);

  // Serialize the Map to an array for JSON transport
  const conflictMapEntries = Array.from(result.conflictMap.entries()).map(
    ([key, conflicts]) => ({ key, conflicts })
  );

  return NextResponse.json({
    totalErrors: result.totalErrors,
    totalWarnings: result.totalWarnings,
    conflictList: result.conflictList,
    conflictMapEntries,
  });
}
