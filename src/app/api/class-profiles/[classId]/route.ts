import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/class-profiles/[classId]
 *
 * Returns the full subject profile for a single class:
 *  • Core subjects — listed individually with their teacher assignment.
 *  • Elective subjects that are NOT in any group — listed individually.
 *  • Elective groups that apply to this class — read-through from
 *    ElectiveGroup (defined in timetable/requirements). Each group contains
 *    its subjects, and for each subject its teacher-pairing rows
 *    (ElectiveGroupTeacher). The class profile is a view of what the
 *    requirements already define; groups cannot be created here.
 *
 * Response shape:
 * {
 *   class: { id, name, form, stream, frameworkType, classTeacher },
 *   subjects: [
 *     { id, name, code, department, globalType, effectiveType }
 *   ],
 *   electiveGroups: [
 *     {
 *       id, name, scopeForm, scopeStreams, lessonsPerWeek,
 *       members: [{ subjectId, subject: { id, code, name } }],
 *       teachers: [{ id, subjectId, teacherId, subject: {...}, teacher: {...} }]
 *     }
 *   ]
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const user =
    (await requireRole("PRINCIPAL")) ?? (await requirePermission("CLASSES", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.classId, schoolId: user.schoolId },
    select: {
      id: true,
      name: true,
      form: true,
      stream: true,
      frameworkType: true,
      classTeacher: { select: { id: true, fullName: true } },
    },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  // All subjects whose applicableForms include this class's form number
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId,
      applicableForms: { has: cls.form },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      department: { select: { id: true, name: true } },
    },
  });

  // Per-class type overrides
  let overrides: { subjectId: string; type: "CORE" | "ELECTIVE" }[] = [];
  try {
    overrides = await prisma.classSubjectProfile.findMany({
      where: { classId: params.classId, schoolId: user.schoolId },
      select: { subjectId: true, type: true },
    });
  } catch {
    // Table not yet migrated — fall back to global types silently
  }

  const overrideMap = new Map(overrides.map((o) => [o.subjectId, o.type as "CORE" | "ELECTIVE"]));

  // Elective groups that apply to this class — wrapped in try/catch so a
  // pending migration doesn't crash the whole endpoint.
  let electiveGroups: Awaited<ReturnType<typeof prisma.electiveGroup.findMany>> = [];
  try {
    const allGroups = await prisma.electiveGroup.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { scopeForm: 0 },
          { scopeForm: cls.form },
        ],
      },
      include: {
        members: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
          },
          orderBy: { subject: { name: "asc" } },
        },
        teachers: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [
            { subject: { name: "asc" } },
            { teacher: { fullName: "asc" } },
          ],
        },
      },
      orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
    });

    electiveGroups = allGroups.filter((g) => {
      if (g.scopeStreams.length === 0) return true;
      if (!cls.stream) return false;
      return g.scopeStreams.some(
        (s) => s.toLowerCase() === cls.stream!.toLowerCase(),
      );
    });
  } catch {
    // ElectiveGroupTeacher table not yet migrated — degrade gracefully
  }

  const subjectsWithEffectiveType = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    globalType: s.type as "CORE" | "ELECTIVE",
    effectiveType: overrideMap.get(s.id) ?? (s.type as "CORE" | "ELECTIVE"),
    department: s.department,
  }));

  return NextResponse.json({
    class: cls,
    subjects: subjectsWithEffectiveType,
    electiveGroups,
  });
}

const patchSchema = z.object({
  assignments: z.array(
    z.object({
      subjectId: z.string().min(1),
      type: z.enum(["CORE", "ELECTIVE"]),
    }),
  ).min(1, "At least one assignment is required."),
});

/**
 * PATCH /api/class-profiles/[classId]
 *
 * Upserts per-class subject type overrides (core/elective toggles for
 * non-grouped subjects). Elective subjects that belong to a group are not
 * managed here — their group membership is defined in timetable requirements.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.classId, schoolId: user.schoolId },
    select: { id: true, form: true },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 },
    );
  }

  const subjectIds = parsed.data.assignments.map((a) => a.subjectId);
  const validSubjects = await prisma.subject.findMany({
    where: {
      id: { in: subjectIds },
      schoolId: user.schoolId,
      applicableForms: { has: cls.form },
    },
    select: { id: true },
  });
  const validIds = new Set(validSubjects.map((s) => s.id));
  const invalid = subjectIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "Some subjects are not valid for this class." },
      { status: 400 },
    );
  }

  try {
    await Promise.all(
      parsed.data.assignments.map((a) =>
        prisma.classSubjectProfile.upsert({
          where: {
            classId_subjectId: { classId: params.classId, subjectId: a.subjectId },
          },
          create: {
            classId: params.classId,
            subjectId: a.subjectId,
            schoolId: user.schoolId,
            type: a.type,
          },
          update: { type: a.type },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[class-profiles PATCH]", e);
    return NextResponse.json({ error: "Couldn't save assignments." }, { status: 500 });
  }
}
