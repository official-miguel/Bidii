/**
 * GET /api/classes/[id]/detail
 *
 * Returns full class workspace data for the ClassWorkspaceDrawer:
 * class info, class teacher, ALL subjects applicable to this class's form
 * (with the assigned teacher included where one exists), and a preview of
 * enrolled students (capped at 30 for performance).
 *
 * Response adds `allSubjects`: every subject this class learns, each with an
 * optional `assignedTeacher` field (null when no teacher has been assigned yet).
 * This allows the drawer to show all subjects even before teachers are set.
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

  // Fetch every subject applicable to this class's form, ordered by type then name
  const allSubjectsRaw = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId,
      applicableForms: { has: cls.form },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, type: true },
  });

  // Build a map of subjectId → assigned teacher from the existing subjectTeachers
  const assignedMap = new Map(
    cls.subjectTeachers.map((st) => [
      st.subject.id,
      { id: st.teacher.id, fullName: st.teacher.fullName },
    ])
  );

  // Merge: all subjects + their assigned teacher (or null)
  const allSubjects = allSubjectsRaw.map((s) => ({
    ...s,
    assignedTeacher: assignedMap.get(s.id) ?? null,
  }));

  // For the subject-teacher picker: fetch teachers per subject
  // (teachers who have that subject in their teacherSubjects list).
  // We return a map of subjectId → [{id, fullName}] so the drawer
  // can show only qualified teachers when assigning.
  const teacherSubjectRows = await prisma.teacherSubject.findMany({
    where: {
      subjectId: { in: allSubjectsRaw.map((s) => s.id) },
      teacher: { schoolId: user.schoolId, archivedAt: null },
    },
    select: {
      subjectId: true,
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: { teacher: { fullName: "asc" } },
  });

  // Build subjectId → teachers array
  const teachersBySubject: Record<string, { id: string; fullName: string }[]> = {};
  for (const row of teacherSubjectRows) {
    if (!teachersBySubject[row.subjectId]) teachersBySubject[row.subjectId] = [];
    teachersBySubject[row.subjectId].push(row.teacher);
  }

  return NextResponse.json({ ...cls, allSubjects, teachersBySubject });
}
