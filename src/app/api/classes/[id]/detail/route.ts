/**
 * GET /api/classes/[id]/detail
 *
 * Returns full class workspace data for the ClassWorkspaceDrawer:
 *  - class info, class teacher, enrolled students (capped at 30)
 *  - allSubjects: every subject applicable to this class's form, each with
 *    an optional assignedTeacher (from ClassSubjectTeacher) — used only for
 *    CORE subjects and ungrouped electives
 *  - teachersBySubject: qualified teachers per subject (for pickers)
 *  - electiveGroups: elective groups that apply to this class (scoped by
 *    form and stream), each with their subjects and teacher pairings
 *    (ElectiveGroupTeacher). The drawer renders these as a read-through view.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("CLASSES", "view")) ??
    (await requirePermission("STUDENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      classTeacher: {
        select: { id: true, fullName: true, email: true },
      },
      subjectTeachers: {
        include: {
          subject: { select: { id: true, name: true, code: true, type: true } },
          teacher: { select: { id: true, fullName: true } },
        },
        orderBy: { subject: { name: "asc" } },
      },
      students: {
        where: { archivedAt: null },
        select: { id: true, fullName: true, admissionNumber: true },
        orderBy: { fullName: "asc" },
        take: 30,
      },
      _count: { select: { students: { where: { archivedAt: null } } } },
    },
  });

  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  // ── Elective groups that apply to this class ──────────────────────────────
  // Fetch groups scoped to this form or school-wide, then filter by stream.
  const allGroups = await prisma.electiveGroup.findMany({
    where: {
      schoolId: user.schoolId,
      OR: [{ scopeForm: 0 }, { scopeForm: cls.form }],
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

  const electiveGroups = allGroups.filter((g) => {
    if (g.scopeStreams.length === 0) return true;
    if (!cls.stream) return false;
    return g.scopeStreams.some((s) => s.toLowerCase() === cls.stream!.toLowerCase());
  });

  // Set of subjectIds that belong to any applicable elective group
  const groupedSubjectIds = new Set(
    electiveGroups.flatMap((g) => g.members.map((m) => m.subjectId))
  );

  // ── All subjects applicable to this form ─────────────────────────────────
  const allSubjectsRaw = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId,
      applicableForms: { has: cls.form },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, type: true },
  });

  // Build a map of subjectId → assigned teacher from ClassSubjectTeacher rows
  const assignedMap = new Map(
    cls.subjectTeachers.map((st) => [
      st.subject.id,
      { id: st.teacher.id, fullName: st.teacher.fullName },
    ])
  );

  // allSubjects excludes subjects that are covered by an elective group —
  // those are shown through the group view, not as individual rows.
  const allSubjects = allSubjectsRaw
    .filter((s) => !groupedSubjectIds.has(s.id))
    .map((s) => ({
      ...s,
      assignedTeacher: assignedMap.get(s.id) ?? null,
    }));

  // ── Qualified teachers per ungrouped subject ──────────────────────────────
  const ungroupedSubjectIds = allSubjectsRaw
    .filter((s) => !groupedSubjectIds.has(s.id))
    .map((s) => s.id);

  const teacherSubjectRows = await prisma.teacherSubject.findMany({
    where: {
      subjectId: { in: ungroupedSubjectIds },
      teacher: { schoolId: user.schoolId, archivedAt: null },
    },
    select: {
      subjectId: true,
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: { teacher: { fullName: "asc" } },
  });

  const teachersBySubject: Record<string, { id: string; fullName: string }[]> = {};
  for (const row of teacherSubjectRows) {
    if (!teachersBySubject[row.subjectId]) teachersBySubject[row.subjectId] = [];
    teachersBySubject[row.subjectId].push(row.teacher);
  }

  return NextResponse.json({ ...cls, allSubjects, teachersBySubject, electiveGroups });
}
