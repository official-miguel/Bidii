import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import StaffPerformancePage from "@/components/assessment/StaffPerformancePage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher staff-performance / ranking page.
 *
 * What each teacher sees:
 *  - Their own rank card (always).
 *  - Department peers (all teachers in their own dept).
 *  - School top 3 as a reference section.
 *
 * viewMode="teacher" in StaffPerformancePage already handles the
 * "school top3" vs "my dept" toggle — we just need to pass the right props.
 */
export default async function TeacherRankingPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);

  // Own primary department.
  let ownDepartmentId: string | undefined;
  if (actor.teacher?.id) {
    const t = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    ownDepartmentId = t?.primaryDepartmentId ?? undefined;
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

  const currentPeriodId = periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Staff Performance</h1>
        <p className="text-sm text-slate mt-0.5">
          Your ranking, department peers, and the school&apos;s top performers.
        </p>
      </div>
      <StaffPerformancePage
        viewMode="teacher"
        periodId={currentPeriodId}
        departmentId={ownDepartmentId}
        currentTeacherId={actor.teacher?.id}
        periods={periods}
      />
    </div>
  );
}
