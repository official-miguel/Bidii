/**
 * API Route: POST /api/timetable/v2/pre-check
 *
 * Runs all pre-generation checks without actually generating a timetable.
 * Returns a detailed report of blocking issues, warnings, and approvals needed.
 * Call this before /api/timetable/v2/generate to surface problems early.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { runPreGenerationChecks } from "@/lib/timetable/preGenerationChecks";
import { checkFeasibility } from "@/lib/timetable/regenerationController";
import { getLessonColumns } from "@/lib/timetable/engineHelpers";
import type { TemplateColumn } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

const schema = z.object({
  classIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { classIds } = body.data;

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
        ...(classIds?.length ? { id: { in: classIds } } : {}),
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
            type: true,
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
      select: {
        studentId: true,
        student: { select: { classId: true } },
        subjectId: true,
      },
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
    return NextResponse.json({
      canProceed: false,
      requiresApproval: false,
      issues: [
        {
          type: "CONFIGURATION_ERROR",
          severity: "BLOCKING",
          message: "Timetable template not configured. Set up the template first.",
          suggestedAction: "Visit Timetable → Template Setup",
        },
      ],
      summary: { blockingIssues: 1, warnings: 0, approvalsNeeded: 0 },
      feasibility: null,
    });
  }

  const templateColumns = timetableConfig.columns as TemplateColumn[];
  const lessonColumns = getLessonColumns(templateColumns);

  if (lessonColumns.length === 0) {
    return NextResponse.json({
      canProceed: false,
      requiresApproval: false,
      issues: [
        {
          type: "CONFIGURATION_ERROR",
          severity: "BLOCKING",
          message: "Template has no lesson slots. Add LESSON columns to the template.",
          suggestedAction: "Visit Timetable → Template Setup and add lesson columns",
        },
      ],
      summary: { blockingIssues: 1, warnings: 0, approvalsNeeded: 0 },
      feasibility: null,
    });
  }

  // Build engine inputs for feasibility check
  const subjectMap = new Map<
    string,
    { id: string; code: string; name: string; internalCode: number; doubleLesson: boolean; requiresSpecialRoom: string | null }
  >();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, req.subject);
    }
  }

  const formStreamCount = new Map<number, number>();
  const engineClasses = classesRaw.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return { id: cls.id, name: cls.name, form: cls.form, stream: cls.stream, streamIndex: count };
  });

  const engineSubjects = Array.from(subjectMap.values()).map((s) => ({
    id: s.id,
    internalCode: s.internalCode,
    code: s.code,
    name: s.name,
    doubleLesson: s.doubleLesson,
    requiresSpecialRoom: s.requiresSpecialRoom,
  }));

  const engineRequirements = requirements
    .filter((r) => !classIds?.length || classIds.includes(r.classId))
    .map((r) => ({
      subjectId: r.subjectId,
      classId: r.classId,
      lessonsPerWeek: r.lessonsPerWeek,
    }));

  const studentSelectionsInput = studentSelections.map((sel) => ({
    studentId: sel.studentId,
    classId: sel.student.classId,
    subjectId: sel.subjectId,
  }));

  const sessionPrefs = sessionPreferences
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  // Load teacher info for feasibility
  const teacherIds = [...new Set(teacherAssignments.map((a) => a.teacherId))];
  const teachersRaw = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, fullName: true },
  });

  // Run pre-generation checks (stream balance, teacher assignments, capacity)
  const preCheck = runPreGenerationChecks({
    subjects: requirements.map((r) => ({
      id: r.subject.id,
      code: r.subject.code,
      name: r.subject.name,
      type: r.subject.type as "CORE" | "ELECTIVE",
    })),
    classes: engineClasses,
    requirements: engineRequirements,
    teacherAssignments,
    studentSelections: studentSelectionsInput,
    templateColumns: lessonColumns.length,
    operatingDays: timetableConfig.operatingDays,
  });

  // Run feasibility check (capacity math)
  const feasibility = checkFeasibility({
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
  });

  // Merge feasibility blocking issues into pre-check results
  const allIssues = [...preCheck.issues];

  for (const issue of feasibility.blockingIssues) {
    allIssues.push({
      type: "INSUFFICIENT_CAPACITY" as const,
      severity: "BLOCKING" as const,
      message: issue,
      suggestedAction: "Reduce lesson requirements or add more template columns",
    });
  }

  for (const warning of feasibility.warnings) {
    allIssues.push({
      type: "INSUFFICIENT_CAPACITY" as const,
      severity: "WARNING" as const,
      message: warning,
    });
  }

  const blockingIssues = allIssues.filter((i) => i.severity === "BLOCKING").length;
  const warnings = allIssues.filter((i) => i.severity === "WARNING").length;
  const approvalsNeeded = allIssues.filter((i) => i.requiresApproval).length;

  return NextResponse.json({
    canProceed: blockingIssues === 0 && feasibility.feasible,
    requiresApproval: approvalsNeeded > 0,
    issues: allIssues,
    summary: { blockingIssues, warnings, approvalsNeeded },
    feasibility: {
      feasible: feasibility.feasible,
      blockingIssues: feasibility.blockingIssues,
      warnings: feasibility.warnings,
    },
    config: {
      classCount: classesRaw.length,
      subjectCount: engineSubjects.length,
      teacherCount: teachersRaw.length,
      requirementsCount: engineRequirements.length,
      lessonSlotsPerWeek: lessonColumns.length * timetableConfig.operatingDays.length,
      totalLessonsRequired: engineRequirements.reduce((s, r) => s + r.lessonsPerWeek, 0),
    },
  });
}
