/**
 * API Route: POST /api/timetable/v2/generate
 *
 * Generates a versioned timetable draft using the CP-SAT constraint solver
 * (Google OR-Tools).  The solver is a complete solver — it either finds the
 * optimal solution in one call or proves the problem is infeasible.
 * No retry loop is used.
 *
 * Requires the timetable-solver Python service to be running.
 * Set TIMETABLE_SOLVER_URL in your environment (default: http://localhost:8080).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { generateWithValidation } from "@/lib/timetable/regenerationController";
import { runPreGenerationChecks } from "@/lib/timetable/preGenerationChecks";
import { getLessonColumns } from "@/lib/timetable/engineHelpers";
import { analyseStaffShortages, type StaffShortageConfig } from "@/lib/timetable/liveConflictDetector";
import type { TemplateColumn, EngineSubject, EngineClass } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

const schema = z.object({
  name: z.string().trim().min(1).max(80).default("Generated draft"),
  description: z.string().trim().max(300).optional(),
  academicYear: z.string().trim().max(10).optional(),
  term: z.number().int().min(1).max(4).nullable().optional(),
  classIds: z.array(z.string()).optional(),
  replaceVersionId: z.string().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional().default(10),
  bypassPreChecks: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    return await _handlePost(req);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[timetable/v2/generate] Unhandled error:", message);
    return NextResponse.json(
      { error: "An unexpected error occurred while generating the timetable.", detail: message },
      { status: 500 }
    );
  }
}

async function _handlePost(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const opts = body.data;

  const [
    classesRaw,
    requirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections,
    timetableConfig,
    sessionPreferences,
  ] = await Promise.all([
    prisma.schoolClass.findMany({
      where: {
        schoolId,
        ...(opts.classIds?.length ? { id: { in: opts.classIds } } : {}),
      },
      select: { id: true, name: true, form: true, stream: true },
      orderBy: [{ form: "asc" }, { name: "asc" }],
    }),
    prisma.subjectLessonRequirement.findMany({
      where: { schoolId },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            internalCode: true,
            doubleLesson: true,
            requiresSpecialRoom: true,
          },
        },
      },
    }),
    prisma.classSubjectTeacher.findMany({
      where: { schoolClass: { schoolId } },
      select: { classId: true, subjectId: true, teacherId: true },
    }),
    prisma.teacherUnavailability.findMany({
      where: { teacher: { schoolId } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    }),
    prisma.studentElective.findMany({
      where: { student: { schoolId, archivedAt: null } },
      select: { studentId: true, student: { select: { classId: true } }, subjectId: true },
    }),
    prisma.timetableConfig.findUnique({
      where: { schoolId },
      include: {
        columns: { orderBy: { position: "asc" } },
        preferences: true,
      },
    }),
    prisma.timetablePreference.findMany({
      where: { config: { schoolId } },
    }),
  ]);

  if (!timetableConfig) {
    return NextResponse.json(
      { error: "Timetable template not configured. Set up the template first." },
      { status: 400 }
    );
  }

  if (classesRaw.length === 0) {
    return NextResponse.json(
      { error: "No classes found. Register classes before generating." },
      { status: 400 }
    );
  }

  const templateColumns = timetableConfig.columns as TemplateColumn[];
  const lessonColumns = getLessonColumns(templateColumns);
  if (lessonColumns.length === 0) {
    return NextResponse.json(
      { error: "Template has no lesson slots." },
      { status: 400 }
    );
  }

  // Build subject map and engine inputs
  const subjectMap = new Map<string, EngineSubject>();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, {
        id: req.subject.id,
        internalCode: req.subject.internalCode,
        code: req.subject.code,
        name: req.subject.name,
        doubleLesson: req.subject.doubleLesson,
        requiresSpecialRoom: req.subject.requiresSpecialRoom,
      });
    }
  }

  const formStreamCount = new Map<number, number>();
  const engineClasses: EngineClass[] = classesRaw.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return { id: cls.id, name: cls.name, form: cls.form, stream: cls.stream, streamIndex: count };
  });

  const engineSubjects = Array.from(subjectMap.values());

  const teacherIds = [...new Set(teacherAssignments.map((a) => a.teacherId))];
  const teachersRaw = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, fullName: true },
  });

  const engineRequirements = requirements
    .filter((r) => !opts.classIds?.length || opts.classIds.includes(r.classId))
    .map((r) => ({
      subjectId: r.subjectId,
      classId: r.classId,
      lessonsPerWeek: r.lessonsPerWeek,
    }));

  const sessionPrefs = sessionPreferences
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  const studentSelectionsInput = studentSelections.map((sel) => ({
    studentId: sel.studentId,
    classId: sel.student.classId,
    subjectId: sel.subjectId,
  }));

  // Pre-generation checks
  if (!opts.bypassPreChecks) {
    const preCheck = runPreGenerationChecks({
      subjects: engineSubjects.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: "CORE" as const,
      })),
      classes: engineClasses,
      requirements: engineRequirements,
      teacherAssignments,
      studentSelections: studentSelectionsInput,
      templateColumns: lessonColumns.length,
      operatingDays: timetableConfig.operatingDays,
    });

    if (!preCheck.canProceed) {
      return NextResponse.json(
        { error: "Pre-generation checks failed", preCheck },
        { status: 400 }
      );
    }
  }

  const engineConfig = {
    academicYear:
      opts.academicYear ?? timetableConfig.academicYear ?? new Date().getFullYear().toString(),
    term: opts.term ?? timetableConfig.term ?? 1,
    operatingDays: timetableConfig.operatingDays,
    maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
    templateColumns,
  };

  const validatorBase = {
    classes: engineClasses,
    subjects: engineSubjects,
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: engineRequirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections: studentSelectionsInput,
    sessionPreferences: sessionPrefs,
    templateColumns,
    operatingDays: timetableConfig.operatingDays,
  };

  const result = await generateWithValidation(
    {
      ...validatorBase,
      config: engineConfig,
    },
    validatorBase,
    { maxAttempts: opts.maxAttempts }
  );

  if (!result.success || !result.finalResult) {
    const reason = result.reason ?? "Unknown error";
    const isSolverDown = reason.includes("unreachable") || result.attempts === 0;

    // Build a teacher-shortage summary from the solver warnings so the admin
    // knows exactly which subjects/teachers caused the failure rather than
    // seeing a generic crash message.
    const shortageLines = (result.finalResult?.warnings ?? [])
      .filter((w) => w.includes("lessons/week") || w.includes("no teacher"))
      .slice(0, 10);   // cap at 10 lines to keep the response readable

    return NextResponse.json(
      {
        error: isSolverDown
          ? "The timetable solver service is not running. Please start it and try again."
          : "The school does not have enough teachers to fill the timetable with the current requirements.",
        reason,
        hint: isSolverDown
          ? "Start the solver: cd timetable-solver && pip install -r requirements.txt && python solver.py"
          : "Assign additional teachers to the subjects listed in 'shortages', reduce lessons-per-week, or remove unavailability blocks.",
        ...(shortageLines.length > 0 ? { shortages: shortageLines } : {}),
      },
      { status: 422 }
    );
  }

  // If the solver succeeded but placed zero lessons the school genuinely has
  // too few teachers (or all teachers are marked unavailable).  Return a clear
  // actionable 422 rather than silently saving an empty draft.
  if (result.finalResult!.slots.length === 0) {
    const shortageLines = result.finalResult!.warnings
      .filter((w) => w.includes("lessons/week") || w.includes("no teacher"))
      .slice(0, 10);
    return NextResponse.json(
      {
        error: "No lessons could be scheduled — the school does not have enough available teachers for the current requirements.",
        hint: "Assign additional teachers to the subjects listed in 'shortages', reduce lessons-per-week, or remove unavailability blocks.",
        shortages: shortageLines,
        warnings: result.finalResult!.warnings,
      },
      { status: 422 }
    );
  }

  // Persist to a versioned draft
  const versionId = opts.replaceVersionId ?? randomUUID();
  const now = new Date();

  // ── Build vulnerability snapshot ──────────────────────────────────────────
  // Collect unique conflict entries from the validation report
  const conflictEntries = result.finalValidation!.issues.map((i) => ({
    type: i.rule,
    severity: (i.severity === "ERROR" ? "error" : "warning") as "error" | "warning",
    message: i.message,
    action: i.affectedClasses?.length
      ? `Affects: ${i.affectedClasses.slice(0, 3).join(", ")}${i.affectedClasses.length > 3 ? ` +${i.affectedClasses.length - 3} more` : ""}`
      : "Review the timetable for this issue.",
  }));

  // Build staff shortage analysis maps
  const subjectTeacherMap = new Map<string, string[]>();
  for (const a of teacherAssignments) {
    const list = subjectTeacherMap.get(a.subjectId) ?? [];
    if (!list.includes(a.teacherId)) list.push(a.teacherId);
    subjectTeacherMap.set(a.subjectId, list);
  }

  const subjectMetaMap = new Map(
    engineSubjects.map((s) => [s.id, { code: s.code, name: s.name }])
  );
  const classMetaMap = new Map(classesRaw.map((c) => [c.id, c.name]));
  const reqMap = new Map<string, number>();
  for (const r of engineRequirements) {
    reqMap.set(`${r.classId}-${r.subjectId}`, r.lessonsPerWeek);
  }

  const shortageConfig: StaffShortageConfig = {
    subjectTeacherMap,
    subjectMeta: subjectMetaMap,
    classMeta: classMetaMap,
    maxLessonsPerTeacherPerWeek:
      timetableConfig.operatingDays.length * timetableConfig.maxLessonsPerTeacherPerDay,
    requiredLessons: reqMap,
  };

  const staffShortages = analyseStaffShortages(shortageConfig);

  const vulnerabilitySnapshot = {
    capturedAt: now.toISOString(),
    totalErrors: result.finalValidation!.summary.errors,
    totalWarnings: result.finalValidation!.summary.warnings,
    conflicts: conflictEntries,
    staffShortages,
  };
  const vulnerabilitiesJson = JSON.stringify(vulnerabilitySnapshot);

  // Batch slot inserts to avoid per-row round-trips that exhaust the transaction timeout (P2028).
  // We chunk into groups of 200 to stay within parameter limits.
  // We deliberately avoid a long-lived interactive $transaction here because
  // the database uses PgBouncer in transaction mode (Neon), which has a very short
  // connection-hold window.  Instead we:
  //  1. Upsert/insert the version row first (fast, single statement)
  //  2. Delete existing slots for this version (fast, single statement)
  //  3. Insert slot chunks individually — each is its own short transaction
  // This keeps every individual DB call well under PgBouncer's timeout.
  const { Prisma } = await import("@prisma/client");
  const CHUNK_SIZE = 200;
  const slots = result.finalResult!.slots;
  const slotChunks: (typeof slots)[] = [];
  for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
    slotChunks.push(slots.slice(i, i + CHUNK_SIZE));
  }

  // Step 1 — version row
  if (opts.replaceVersionId) {
    await prisma.$executeRaw`
      DELETE FROM "TimetableVersionSlot" WHERE "versionId" = ${versionId}`;
    await prisma.$executeRaw`
      UPDATE "TimetableVersion"
      SET name = ${opts.name},
          description = ${opts.description ?? null},
          "academicYear" = ${opts.academicYear ?? null},
          term = ${opts.term ?? null},
          "generatedAt" = ${now},
          "updatedAt" = ${now},
          "vulnerabilities" = ${vulnerabilitiesJson}::jsonb
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersion"
        (id, "schoolId", name, description, status, "academicYear", term,
         "generatedAt", "createdById", "createdAt", "updatedAt", "vulnerabilities")
      VALUES (${versionId}, ${schoolId}, ${opts.name},
              ${opts.description ?? null}, 'DRAFT',
              ${opts.academicYear ?? null}, ${opts.term ?? null},
              ${now}, ${user.id}, ${now}, ${now},
              ${vulnerabilitiesJson}::jsonb)`;
  }

  // Step 2 — slot chunks (short individual statements, no long-held connection)
  for (const chunk of slotChunks) {
    if (chunk.length === 0) continue;
    const rows = chunk.map((s) =>
      Prisma.sql`(${randomUUID()}, ${versionId}, ${schoolId}, ${s.classId},
                  ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
                  ${s.room ?? null}, false, ${now}, ${now})`
    );
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersionSlot"
        (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
         "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("versionId", "classId", "dayOfWeek", period) DO NOTHING`;
  }

  const classNameMap = new Map(classesRaw.map((c) => [c.id, c.name]));
  const subjectCodeMap = new Map(engineSubjects.map((s) => [s.id, s.code]));
  const teacherNameMap = new Map(teachersRaw.map((t) => [t.id, t.fullName]));

  return NextResponse.json({
    versionId,
    name: opts.name,
    slotCount: result.finalResult.slots.length,
    solverStatus: "CP-SAT",
    stats: result.finalResult.stats,
    warnings: result.finalResult.warnings,
    staffShortages: staffShortages.length > 0 ? staffShortages : undefined,
    vulnerabilities: vulnerabilitySnapshot,
    validation: {
      valid: result.finalValidation!.valid,
      passedRules: result.finalValidation!.passedRules,
      failedRules: result.finalValidation!.failedRules,
      summary: result.finalValidation!.summary,
    },
    slots: result.finalResult.slots.map((s) => ({
      classId: s.classId,
      className: classNameMap.get(s.classId) ?? "",
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectCode: subjectCodeMap.get(s.subjectId) ?? "",
      teacherId: s.teacherId,
      teacherName: teacherNameMap.get(s.teacherId) ?? "",
      room: s.room,
    })),
  });
}
