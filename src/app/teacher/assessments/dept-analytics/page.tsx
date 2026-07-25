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

  const isHod        = actor.roles.some((r) => r.role === "HOD");
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
    const all = await prisma.department.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (ownDeptId) {
      departments = [
        ...all.filter((d) => d.id === ownDeptId),
        ...all.filter((d) => d.id !== ownDeptId),
      ];
    } else {
      departments = all;
    }
  }

  // Classes — scope to teacher's assigned classes unless wide access.
  let classFilter: { id: { in: string[] } } | Record<string, never> = {};
  if (!isWideAccess && actor.teacher?.id) {
    const assignments = await prisma.classSubjectTeacher.findMany({
      where: { teacherId: actor.teacher.id },
      select: { classId: true },
    });
    const ids = [...new Set(assignments.map((a) => a.classId))];
    if (actor.classTeacherOfId) ids.push(actor.classTeacherOfId);
    const unique = [...new Set(ids)];
    classFilter = unique.length > 0 ? { id: { in: unique } } : { id: { in: ["__none__"] } };
  }

  const classes = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId, ...classFilter },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true },
  }) as Array<{ id: string; name: string; form: number }>;

  // Subjects — teacher's assigned subjects or all if wide access.
  const subjectIds = isWideAccess || !actor.teacher?.id
    ? undefined
    : (await prisma.classSubjectTeacher.findMany({
        where: { teacherId: actor.teacher.id },
        select: { subjectId: true },
      })).map((a) => a.subjectId);

  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId,
      ...(subjectIds ? { id: { in: subjectIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicableForms: true },
  });

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
        classes={classes}
        subjects={subjects}
      />
    </div>
  );
}
