/**
 * API Route: POST /api/timetable/generate
 *
 * Generates a timetable using the CP-SAT constraint solver (Google OR-Tools).
 * The solver is a complete solver — it either finds the optimal solution in
 * one call or proves the problem is infeasible.  No retry loop is used.
 *
 * Requires the timetable-solver Python service to be running.
 * Set TIMETABLE_SOLVER_URL in your environment (default: http://localhost:8080).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { generateWithValidation, checkFeasibility } from "@/lib/timetable/regenerationController";
import { runPreGenerationChecks } from "@/lib/timetable/preGenerationChecks";
import { getLessonColumns, buildLinkedClassGroups, buildGroupAwarePayload, fanOutGroupSlots } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";
import type { TemplateColumn, EngineSubject, EngineClass } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

const schema = z.object({
  classIds: z.array(z.string()).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional().default(10),
  bypassPreChecks: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { classIds, maxAttempts, bypassPreChecks } = parsed.data;

  // Load all required data in parallel
  const [
    classesRaw,
    requirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections,
    timetableConfig,
    sessionPreferences,
    electiveGroupsRaw,
    classElectiveTeachersRaw,
  ] = await Promise.all([
    prisma.schoolClass.findMany({
      where: {
        schoolId,
        ...(classIds ? { id: { in: classIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        form: true,
        stream: true,
      },
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
            type: true,
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
    // Elective groups — used to build the hard co-scheduling constraint
    prisma.electiveGroup.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        scopeForm: true,
        scopeStreams: true,
        lessonsPerWeek: true,
        doublesPerWeek: true,
        members: { select: { subjectId: true } },
      },
    }),
    // Per-class elective group teacher assignments (replaces ClassSubjectTeacher for group subjects)
    prisma.classElectiveGroupTeacher.findMany({
      where: { schoolId },
      select: { groupId: true, classId: true, subjectId: true, teacherId: true },
    }),
  ]);

  if (!timetableConfig) {
    return NextResponse.json(
      {
        error: "Timetable template not configured",
        hint: "Visit Timetable → Template Setup to configure the school day format first",
      },
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
      { error: "Template has no lesson slots. Add lesson columns to the template first." },
      { status: 400 }
    );
  }

  // Build subject map from requirements
  const subjectMap = new Map<
    string,
    { id: string; code: string; name: string; type: string; internalCode: number; doubleLesson: boolean; requiresSpecialRoom: string | null }
  >();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, req.subject);
    }
  }

  // Build stream index (position within form)
  const formStreamCount = new Map<number, number>();
  const sortedClasses = [...classesRaw].sort((a, b) => {
    if (a.form !== b.form) return a.form - b.form;
    return a.name.localeCompare(b.name);
  });
  const engineClasses: EngineClass[] = sortedClasses.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return {
      id: cls.id,
      name: cls.name,
      form: cls.form,
      stream: cls.stream,
      streamIndex: count,
    };
  });

  // ── Group-aware payload: collapse group subjects to one anchor each ────────
  const linkedClassGroupsList = buildLinkedClassGroups(electiveGroupsRaw, classesRaw);

  // Build a lookup: groupId → Set of classIds that have at least one
  // ClassElectiveGroupTeacher row for that group. Only these classes have
  // teachers assigned and should be included in the group descriptor —
  // scope-eligible classes without any teacher assignment are excluded so
  // the pre-check surfaces them as missing-teacher errors rather than
  // silently producing empty timetable slots during fan-out.
  const groupClassesWithTeachers = new Map<string, Set<string>>();
  for (const gt of classElectiveTeachersRaw) {
    if (!groupClassesWithTeachers.has(gt.groupId)) {
      groupClassesWithTeachers.set(gt.groupId, new Set());
    }
    groupClassesWithTeachers.get(gt.groupId)!.add(gt.classId);
  }

  const groupDescriptors: GroupPayloadDescriptor[] = electiveGroupsRaw
    .filter((g) => g.members.length > 0)
    .map((g) => {
      // A class must both be in scope AND have at least one teacher assigned
      // in ClassElectiveGroupTeacher to participate in this group.
      const classesWithTeachersForGroup = groupClassesWithTeachers.get(g.id) ?? new Set<string>();
      const inScope = classesRaw.filter((cls) => {
        if (g.scopeForm !== 0 && cls.form !== g.scopeForm) return false;
        if (g.scopeForm !== 0 && g.scopeStreams.length > 0 && !g.scopeStreams.includes(cls.stream ?? "")) return false;
        // Only include if teachers are actually assigned for this class in this group
        return classesWithTeachersForGroup.has(cls.id);
      });
      return {
        groupId:        g.id,
        name:           g.name,
        subjectIds:     g.members.map((m) => m.subjectId),
        lessonsPerWeek: g.lessonsPerWeek,
        doublesPerWeek: g.doublesPerWeek ?? 0,
        classIds:       inScope.map((c) => c.id),
      };
    })
    .filter((d) => d.classIds.length >= 1);

  const engineRequirements = requirements
    .filter((r) => !classIds || classIds.includes(r.classId))
    .map((r) => ({
      subjectId: r.subjectId,
      classId: r.classId,
      lessonsPerWeek: r.lessonsPerWeek,
    }));

  const groupPayload = buildGroupAwarePayload(
    engineRequirements,
    teacherAssignments,
    groupDescriptors,
    classElectiveTeachersRaw,
  );

  // Anchor key set for fan-out after solve
  const anchorKeys = new Set<string>();
  for (const desc of groupDescriptors) {
    if (desc.subjectIds.length === 0) continue;
    const anchorSid = desc.subjectIds[0];
    for (const cid of desc.classIds) anchorKeys.add(`${cid}:${anchorSid}`);
  }

  // Augment subject map with any pure group subjects not in requirements
  for (const gt of classElectiveTeachersRaw) {
    if (!subjectMap.has(gt.subjectId)) {
      const sub = await prisma.subject.findUnique({
        where: { id: gt.subjectId },
        select: { id: true, code: true, name: true, type: true, internalCode: true, doubleLesson: true, requiresSpecialRoom: true },
      });
      if (sub) subjectMap.set(sub.id, sub);
    }
  }

  // Anchor subjects whose group has doublesPerWeek > 0 must be treated as
  // double-lesson subjects by the solver, regardless of the Subject.doubleLesson
  // flag (which reflects the subject's default, not the group override).
  const { doubleAnchorSubjectIds } = groupPayload;

  const engineSubjectsWithGroups: EngineSubject[] = Array.from(subjectMap.values()).map((s) => ({
    id: s.id,
    internalCode: s.internalCode,
    code: s.code,
    name: s.name,
    doubleLesson: s.doubleLesson || doubleAnchorSubjectIds.has(s.id),
    requiresSpecialRoom: s.requiresSpecialRoom,
  }));

  // Load teacher records — include group teachers
  const allTeacherIds = [
    ...new Set([
      ...teacherAssignments.map((a) => a.teacherId),
      ...classElectiveTeachersRaw.map((g) => g.teacherId),
    ]),
  ];
  const teachersRaw = await prisma.teacher.findMany({
    where: { id: { in: allTeacherIds } },
    select: { id: true, fullName: true },
  });

  const sessionPrefs = sessionPreferences.map((p) => ({
    subjectCode: p.subjectCode || "",
    preferredSession: p.preferredSession as TimetableSession,
    isHard: p.isHard,
  })).filter((p) => p.subjectCode && p.preferredSession);

  const studentSelectionsInput = studentSelections.map((sel) => ({
    studentId: sel.studentId,
    classId: sel.student.classId,
    subjectId: sel.subjectId,
  }));

  // Run pre-generation checks unless bypassed
  if (!bypassPreChecks) {
    const preCheck = runPreGenerationChecks({
      subjects: engineSubjectsWithGroups.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: (subjectMap.get(s.id)?.type ?? "CORE") as "CORE" | "ELECTIVE",
        doubleLesson: s.doubleLesson,
      })),
      classes: engineClasses,
      requirements: groupPayload.requirements,
      teacherAssignments: groupPayload.teacherAssignments,
      studentSelections: studentSelectionsInput,
      templateColumns: lessonColumns.length,
      operatingDays: timetableConfig.operatingDays,
    });

    if (!preCheck.canProceed) {
      return NextResponse.json(
        {
          error: "Pre-generation checks failed",
          preCheck,
          hint: "Resolve blocking issues before generating. Pass bypassPreChecks:true to override warnings only.",
        },
        { status: 400 }
      );
    }

    if (preCheck.requiresApproval) {
      return NextResponse.json(
        {
          error: "Admin approval required before generating",
          preCheck,
          hint: "Some stream balance issues require admin approval. Resolve them in Timetable → Stream Balance.",
        },
        { status: 400 }
      );
    }
  }

  // Check feasibility before attempting generation
  const feasibility = checkFeasibility({
    classes: engineClasses,
    subjects: engineSubjectsWithGroups,
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: groupPayload.requirements,
    teacherAssignments: groupPayload.teacherAssignments,
    teacherUnavailability,
    studentSelections: studentSelectionsInput,
    sessionPreferences: sessionPrefs,
    templateColumns,
    operatingDays: timetableConfig.operatingDays,
  });

  if (!feasibility.feasible) {
    return NextResponse.json(
      {
        error: "Cannot generate timetable",
        blockingIssues: feasibility.blockingIssues,
        warnings: feasibility.warnings,
      },
      { status: 400 }
    );
  }

  // Run deterministic generation with automatic validation + regeneration
  const result = await generateWithValidation(
    {
      subjects: engineSubjectsWithGroups,
      classes: engineClasses,
      teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
      requirements: groupPayload.requirements,
      teacherAssignments: groupPayload.teacherAssignments,
      teacherUnavailability,
      studentSelections: studentSelectionsInput,
      sessionPreferences: sessionPrefs,
      config: {
        academicYear: timetableConfig.academicYear || new Date().getFullYear().toString(),
        term: timetableConfig.term || 1,
        operatingDays: timetableConfig.operatingDays,
        maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
        templateColumns,
      },
      linkedClassGroups: linkedClassGroupsList,
    },
    {
      classes: engineClasses,
      subjects: engineSubjectsWithGroups,
      teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
      requirements: groupPayload.requirements,
      teacherAssignments: groupPayload.teacherAssignments,
      teacherUnavailability,
      studentSelections: studentSelectionsInput,
      sessionPreferences: sessionPrefs,
      templateColumns,
      operatingDays: timetableConfig.operatingDays,
    },
    { maxAttempts }
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
  // actionable 422 rather than silently saving an empty timetable.
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

  // ── Fan-out: expand anchor slots → one per group subject ─────────────────
  result.finalResult!.slots = fanOutGroupSlots(
    result.finalResult!.slots,
    groupPayload.fanOutMap,
    anchorKeys,
  );

  // Save generated slots to database in a transaction
  const savedSlots = await prisma.$transaction(async (tx) => {
    // Clear existing slots for the target classes
    const targetClassIds = engineClasses.map((c) => c.id);

    await tx.timetableSlot.deleteMany({
      where: {
        schoolId,
        classId: { in: targetClassIds },
      },
    });

    // Insert new slots
    await tx.timetableSlot.createMany({
      data: result.finalResult!.slots.map((slot) => ({
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
        room: slot.room,
        schoolId,
      })),
    });

    return result.finalResult!.slots.length;
  });

  // Build display-enriched response
  const classNameMap = new Map(classesRaw.map((c) => [c.id, c.name]));
  const subjectCodeMap = new Map(engineSubjectsWithGroups.map((s) => [s.id, s.code]));
  const teacherNameMap = new Map(teachersRaw.map((t) => [t.id, t.fullName]));

  return NextResponse.json({
    success: true,
    savedSlots,
    solverStatus: "CP-SAT",
    stats: result.finalResult.stats,
    warnings: result.finalResult.warnings,
    validation: {
      valid: result.finalValidation!.valid,
      passedRules: result.finalValidation!.passedRules,
      failedRules: result.finalValidation!.failedRules,
      summary: result.finalValidation!.summary,
    },
    slots: result.finalResult.slots.map((slot) => ({
      ...slot,
      className: classNameMap.get(slot.classId),
      subjectCode: subjectCodeMap.get(slot.subjectId),
      teacherName: teacherNameMap.get(slot.teacherId),
    })),
    feasibilityWarnings: feasibility.warnings,
  });
}
