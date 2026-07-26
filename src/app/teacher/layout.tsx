import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePermissions,
  getVisibleHubs,
  hasAssignedRoles,
} from "@/lib/permissions";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import PermissionProvider from "@/components/PermissionProvider";

// Teacher base hubs — always visible regardless of extra roles.
// These mirror the pages that actually exist under /teacher/*.
const TEACHER_BASE_HUBS = new Set([
  "dashboard",
  "academic",    // assessments, attendance, timetable, calendar
  "student-life", // records (if class teacher)
  "calendar",
  "communication",
] as const);

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const [school, teacher, hasRoles] = await Promise.all([
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, motto: true } }),
    prisma.teacher.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    hasAssignedRoles(user.id),
  ]);

  const roleLabel = teacher?.fullName ?? "Teacher";

  // Fast path — no extra roles assigned → pass undefined so the sidebar
  // shows all hubs (existing behaviour, zero extra DB queries).
  let visibleHubs: Set<string> | undefined = undefined;

  if (hasRoles) {
    // Compute which hubs the assigned StaffRoles unlock, then union with
    // the teacher base set so nothing the teacher already had is hidden.
    const extraPerms   = await getEffectivePermissions(user);
    const extraHubs    = getVisibleHubs(extraPerms); // Set<NavHub>
    const merged       = new Set([...TEACHER_BASE_HUBS, ...extraHubs]);
    visibleHubs        = merged as Set<string>;
  }

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="teacher"
        roleLabel={roleLabel}
        userEmail={user.email}
        schoolName={school?.name}
        motto={school?.motto}
        visibleHubs={visibleHubs as Parameters<typeof DashboardShell>[0]["visibleHubs"]}
      >
        <PermissionProvider schoolId={user.schoolId} userId={user.id}>
          {children}
        </PermissionProvider>
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
