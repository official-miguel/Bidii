import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import DeptAnalyticsPage from "@/components/assessment/DeptAnalyticsPage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher dept-analytics page.
 *
 * Access:  DIRECTOR / EXAM_OFFICER / HOD roles (checked via canAccessDashboard).
 * Scoping: Teacher's own department always listed first. HOD sees only own dept.
 *          DIRECTOR/EXAM_OFFICER see all departments.
 */
export default async function TeacherDeptAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);
  if (!canAccessDashboard(actor)) {
    redirect("/teacher/assessments");
  }

  const isHod       = actor.roles.some((r) => r.role === "HOD");
  const isWideAccess = actor.roles.some((r) => ["DIRECTOR", "EXAM_OFFICER"].includes(r.role));

  // Resolve own department.
  let ownDeptId: string | undefined;
  if (actor.teacher?.id) {
    const t = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    ownDeptId = t?.primaryDepartmentId ?? undefined;
  }

  let departments: Array<{ id: string; name: string }>;

  if (isHod && !isWideAccess) {
    // HOD: only their own dept.
    if (ownDeptId) {
      const dept = await prisma.department.findUnique({
        where: { id: ownDeptId },
        select: { id: true, name: true },
      });
      departments = dept ? [dept] : [];
    } else {
      departments = [];
    }
  } else {
    // DIRECTOR/EXAM_OFFICER: all depts, own dept floated to top.
    const all = await prisma.department.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (ownDeptId) {
      const own   = all.filter((d) => d.id === ownDeptId);
      const rest  = all.filter((d) => d.id !== ownDeptId);
      departments = [...own, ...rest];
    } else {
      departments = all;
    }
  }

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? (await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
      }) as Array<{ id: string; name: string; academicYear: string; term: number | null; isCurrent: boolean }>)
    : [];

  const currentPeriodId = periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id;

  if (departments.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-xl font-semibold text-ink">Department Analytics</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No departments accessible. Contact the principal to assign a department role.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Department Analytics</h1>
        <p className="text-sm text-slate mt-0.5">
          Subject breakdown, trends, and class performance heatmap by department.
          {ownDeptId && departments[0]?.id === ownDeptId && (
            <span className="ml-2 text-xs font-medium text-royal">Your dept shown first</span>
          )}
        </p>
      </div>
      <DeptAnalyticsPage
        departments={departments}
        defaultDepartmentId={departments[0]?.id}
        currentPeriodId={currentPeriodId}
        periods={periods}
      />
    </div>
  );
}
