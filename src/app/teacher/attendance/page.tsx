import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AttendancePageTabs from "@/components/AttendancePageTabs";

export default async function TeacherAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      classTeacherOf: { select: { id: true, name: true } },
      subjectAssignments: {
        select: { schoolClass: { select: { id: true, name: true } } },
      },
      classElectiveGroupTeachers: {
        select: { schoolClass: { select: { id: true, name: true } } },
      },
    },
  });

  // Build a deduped list of taught classes — classTeacherOf pinned first (R8.4)
  const classSet = new Map<string, { id: string; name: string }>();
  if (teacher?.classTeacherOf) classSet.set(teacher.classTeacherOf.id, teacher.classTeacherOf);
  for (const a of teacher?.subjectAssignments ?? []) classSet.set(a.schoolClass.id, a.schoolClass);
  for (const e of teacher?.classElectiveGroupTeachers ?? [])
    classSet.set(e.schoolClass.id, e.schoolClass);
  const taughtClasses = Array.from(classSet.values());

  const isClassTeacher = !!teacher?.classTeacherOf;
  const hasAnyClass = taughtClasses.length > 0;

  // R8.9: teacher with no assignments sees no attendance at all
  if (!hasAnyClass) {
    return (
      <div>
        <PageHeader title="Attendance" />
        <p className="text-slate text-sm dark:text-dark-muted">
          Attendance is available once you have been assigned to teach a class. You aren&apos;t
          assigned to any class yet — ask the principal to assign you one first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Attendance" />
      <AttendancePageTabs
        isClassTeacher={isClassTeacher}
        classTeacherOf={teacher?.classTeacherOf ?? null}
        taughtClasses={taughtClasses}
      />
    </div>
  );
}
