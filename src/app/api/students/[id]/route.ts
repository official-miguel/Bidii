import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      schoolClass: { select: { id: true, name: true, form: true } },
      electives:   { include: { subject: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  return NextResponse.json(student);
}

const updateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
  classId: z.string().min(1).optional(),
  parentName: z.string().trim().optional().or(z.literal("")),
  parentContact: z.string().trim().optional().or(z.literal("")),
  electiveSubjectIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { electiveSubjectIds, dateOfBirth, ...rest } = parsed.data;

  const existing = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  if (rest.classId) {
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: rest.classId, schoolId: user.schoolId },
    });
    if (!schoolClass) return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
  }

  if (electiveSubjectIds && electiveSubjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: electiveSubjectIds }, schoolId: user.schoolId },
    });
    if (count !== electiveSubjectIds.length) {
      return NextResponse.json({ error: "Choose valid elective subjects." }, { status: 400 });
    }
  }

  try {
    const student = await prisma.$transaction(async (tx) => {
      if (electiveSubjectIds) {
        await tx.studentElective.deleteMany({ where: { studentId: params.id } });
        await tx.studentElective.createMany({
          data: electiveSubjectIds.map((subjectId) => ({ studentId: params.id, subjectId })),
          skipDuplicates: true,
        });
      }
      return tx.student.update({
        where: { id: params.id },
        data: {
          ...rest,
          parentName: rest.parentName === "" ? null : rest.parentName,
          parentContact: rest.parentContact === "" ? null : rest.parentContact,
          ...(dateOfBirth !== undefined
            ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
            : {}),
        },
      });
    });
    emitSSE(user.schoolId, "student.updated", student);
    return NextResponse.json(student);
  } catch {
    return NextResponse.json({ error: "Couldn't update student." }, { status: 500 });
  }
}

export async function DELETE() {
  // Hard deletion of students is permanently disabled.
  // Use POST /api/students/[id]/archive to transfer or expel a student —
  // this preserves every associated record (attendance, grades, discipline,
  // achievements, library history, etc.) and moves the student into the
  // History module.
  return NextResponse.json(
    { error: "Permanent deletion is disabled. Use the Remove Student action to archive the student instead." },
    { status: 405 }
  );
}
