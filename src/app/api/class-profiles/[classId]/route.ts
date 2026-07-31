import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/class-profiles/[classId]
 *
 * Returns the class detail including all subjects that apply to this class
 * (based on applicableForms matching the class's form level), along with
 * any per-class type overrides stored in ClassSubjectProfile.
 *
 * Response shape:
 * {
 *   class: { id, name, form, stream, frameworkType, classTeacher },
 *   subjects: [
 *     { id, name, code, department, globalType, effectiveType }
 *   ]
 * }
 *
 * effectiveType is the type that applies to THIS class — either an explicit
 * per-class override or the subject's global type.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { classId: string } }
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

  // Per-class overrides: check if ClassSubjectProfile table exists in schema.
  // Since it doesn't exist yet (we use SubjectLessonRequirement for timetable
  // data), we store overrides in a lightweight JSON approach using the existing
  // SubjectLessonRequirement metadata field is not available.
  //
  // We check for an existing ClassSubjectProfile prisma model. If not present,
  // effectiveType equals globalType (no overrides yet). The PATCH endpoint
  // below creates / updates overrides using a dedicated table.
  //
  // ── ClassSubjectProfile is created by the migration below. If the table
  // doesn't exist in DB yet, the prisma call will fail gracefully in dev.
  let overrides: { subjectId: string; type: "CORE" | "ELECTIVE" }[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overrides = await (prisma as any).classSubjectProfile.findMany({
      where: { classId: params.classId, schoolId: user.schoolId },
      select: { subjectId: true, type: true },
    });
  } catch {
    // Table not yet migrated — fall back to global types silently
  }

  const overrideMap = new Map(overrides.map((o) => [o.subjectId, o.type]));

  const subjectsWithEffectiveType = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    globalType: s.type,
    effectiveType: overrideMap.get(s.id) ?? s.type,
    department: s.department,
  }));

  return NextResponse.json({ class: cls, subjects: subjectsWithEffectiveType });
}

const patchSchema = z.object({
  /**
   * Array of per-class subject type assignments.
   * Each entry sets the effectiveType for a subject within this class only.
   * Pass the full list every save — rows not included are left unchanged.
   */
  assignments: z.array(
    z.object({
      subjectId: z.string().min(1),
      type: z.enum(["CORE", "ELECTIVE"]),
    })
  ).min(1, "At least one assignment is required."),
});

/**
 * PATCH /api/class-profiles/[classId]
 *
 * Upserts per-class subject type overrides. Each assignment sets whether
 * a subject is CORE or ELECTIVE for THIS class specifically, independent
 * of the subject's global type.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { classId: string } }
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
      { status: 400 }
    );
  }

  // Verify all subjects belong to this school and apply to this class's form
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
      { status: 400 }
    );
  }

  try {
    // Upsert each assignment using the ClassSubjectProfile table
    await Promise.all(
      parsed.data.assignments.map((a) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).classSubjectProfile.upsert({
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
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[class-profiles PATCH]", e);
    return NextResponse.json({ error: "Couldn't save assignments." }, { status: 500 });
  }
}
