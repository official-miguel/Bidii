import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardCharts from "@/components/assessment/DashboardCharts";
import CbeDashboardEnhanced from "@/components/assessment/CbeDashboardEnhanced";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher dashboard — scoped to the classes and subjects this teacher teaches.
 * DIRECTOR / EXAM_OFFICER roles see everything (same as principal).
 */
export default async function TeacherDashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);

  const isWideAccess = actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  // Resolve the classes this teacher teaches.
  let classFilter: { id: { in: string[] } } | Record<string, never> = {};
  if (!isWideAccess && actor.teacher?.id) {
    const assignments = await prisma.classSubjectTeacher.findMany({
      where: { teacherId: actor.teacher.id },
      select: { classId: true },
    });
    const ownClassIds = [...new Set(assignments.map((a) => a.classId))];
    if (actor.classTeacherOfId) ownClassIds.push(actor.classTeacherOfId);
    // Deduplicate.
    const uniqueIds = [...new Set(ownClassIds)];
    classFilter = uniqueIds.length > 0 ? { id: { in: uniqueIds } } : { id: { in: ["__none__"] } };
  }

  const allClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId, ...classFilter },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  // Subjects: teacher's assigned subjects, or all if wide access.
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
    select: { id: true, name: true },
  });

  const cbeClasses  = allClasses.filter((c) => c.frameworkType === "CBE");
  const kcseClasses = allClasses.filter((c) => c.frameworkType !== "CBE");
  const hasBoth     = cbeClasses.length > 0 && kcseClasses.length > 0;
  const hasCbeOnly  = cbeClasses.length > 0 && kcseClasses.length === 0;

  const tab = searchParams.tab ?? (hasCbeOnly ? "cbe" : "844");

  if (allClasses.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-xl font-semibold text-ink">Dashboard</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No class assignments found. Contact the principal to be assigned to classes.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-slate mt-0.5">
          {isWideAccess ? "School-wide assessment analytics." : "Analytics for your assigned classes and subjects."}
        </p>
      </div>

      {hasBoth && (
        <div className="flex gap-1 border-b border-line">
          {[{ key: "844", label: `8-4-4 (${kcseClasses.length})` }, { key: "cbe", label: `CBE (${cbeClasses.length})` }].map(({ key, label }) => (
            <a key={key} href={`?tab=${key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"}`}>
              {label}
            </a>
          ))}
        </div>
      )}

      {(tab === "844" || !hasBoth) && kcseClasses.length > 0 && (
        <DashboardCharts
          classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
          subjects={subjects}
        />
      )}

      {(tab === "cbe" || hasCbeOnly) && cbeClasses.length > 0 && (
        <CbeDashboardEnhanced
          classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
          cbeOnly={false}
        />
      )}
    </div>
  );
}
