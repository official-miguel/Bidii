import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "TEACHER") {
    redirect("/login");
  }

  const [school, teacher] = await Promise.all([
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } }),
    prisma.teacher.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
  ]);

  const roleLabel = teacher?.fullName ? teacher.fullName : "Teacher";

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="teacher"
        roleLabel={roleLabel}
        userEmail={user.email}
        schoolName={school?.name}
        // visibleHubs undefined → all hubs shown (teacher sees everything in sidebar)
      >
        {children}
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
