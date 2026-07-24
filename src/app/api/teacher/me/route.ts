import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const user = await requireRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    include: {
      classTeacherOf: { select: { id: true, name: true } },
      timetableSlots: {
        include: {
          subject: { select: { id: true, name: true, code: true } },
          schoolClass: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!teacher) {
    return NextResponse.json({ error: "No staff record linked to this login." }, { status: 404 });
  }

  // Group distinct (subject, class) pairs actually on this teacher's
  // timetable — that's the set Section 3D.1 says results entry should offer.
  const bySubject = new Map<
    string,
    { subject: { id: string; name: string; code: string }; classes: { id: string; name: string }[] }
  >();
  for (const slot of teacher.timetableSlots) {
    const entry = bySubject.get(slot.subject.id) || { subject: slot.subject, classes: [] };
    if (!entry.classes.some((c) => c.id === slot.schoolClass.id)) {
      entry.classes.push(slot.schoolClass);
    }
    bySubject.set(slot.subject.id, entry);
  }

  return NextResponse.json({
    fullName: teacher.fullName,
    classTeacherOf: teacher.classTeacherOf,
    assignments: Array.from(bySubject.values()),
  });
}
