import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AttendanceView from "@/components/AttendanceView";

export default async function TeacherAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    include: { classTeacherOf: true },
  });

  if (!teacher?.classTeacherOf) {
    return (
      <div>
        <PageHeader title="Attendance" />
        <p className="text-slate text-sm dark:text-dark-muted">
          Attendance is only available to a class&apos;s assigned class teacher. You aren&apos;t the class
          teacher of any class yet — ask the principal to assign you one first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={`Take attendance for ${teacher.classTeacherOf.name}.`}
      />
      <AttendanceView
        classes={[{ id: teacher.classTeacherOf.id, name: teacher.classTeacherOf.name }]}
        lockClass
      />
    </div>
  );
}
