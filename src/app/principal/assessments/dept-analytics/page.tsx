import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import DeptAnalyticsPage from "@/components/assessment/DeptAnalyticsPage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function DeptAnalyticsRoute() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);
  if (!canAccessDashboard(actor)) redirect("/principal/assessments");

  // HOD: only their own dept. Director/Principal: all depts.
  const isHod = actor.roles.some((r) => r.role === "HOD");
  let departments: Array<{ id: string; name: string }>;
  if (isHod && actor.teacher?.id) {
    const hodDept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true, name: true },
    });
    departments = hodDept ? [hodDept] : [];
  } else {
    departments = await prisma.department.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
      }) as Array<{ id: string; name: string; academicYear: string; term: number | null; isCurrent: boolean }>
    : [];

  const currentPeriodId = periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Department Analytics</h1>
        <p className="text-sm text-slate mt-0.5">Subject breakdown, trends, and class performance heatmap by department.</p>
      </div>
      {departments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
          No departments found. Add departments first.
        </div>
      ) : (
        <DeptAnalyticsPage
          departments={departments}
          defaultDepartmentId={departments[0]?.id}
          currentPeriodId={currentPeriodId}
          periods={periods}
        />
      )}
    </div>
  );
}
