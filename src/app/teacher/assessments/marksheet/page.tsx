import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MarksheetGrid from "@/components/assessment/MarksheetGrid";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import CbePathwayGrid from "@/components/assessment/CbePathwayGrid";
import { resolveAssessmentActor, canEnterMarks, canViewMarksheet } from "@/lib/assessment/auth844";
import DoneBar from "@/components/assessment/DoneBar";
import MarksheetPageClient from "@/components/assessment/MarksheetPageClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function TeacherMarksheetPage({
  searchParams,
}: {
  searchParams: { classId?: string; subjectId?: string; periodId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);
  const classTeacherOfId = actor.classTeacherOfId;

  // Resolve this teacher's primary department and the subjects it owns.
  let deptSubjectIds: Set<string> = new Set();
  if (actor.teacher?.id) {
    const teacherRow = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    if (teacherRow?.primaryDepartmentId) {
      const deptSubjects = await prisma.subject.findMany({
        where: { schoolId: user.schoolId, departmentId: teacherRow.primaryDepartmentId },
        select: { id: true },
      });
      deptSubjectIds = new Set(deptSubjects.map((s) => s.id));
    }
  }

  // ── Resolve all periods for the period selector ───────────────────────────
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const allPeriods: Array<{
    id: string; name: string; academicYear: string;
    term: number | null; isCurrent: boolean;
  }> = framework
    ? await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
      })
    : [];

  const currentPeriod = allPeriods.find((p) => p.isCurrent) ?? allPeriods[0] ?? null;
  const currentPeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

  // ── Resolve classes ───────────────────────────────────────────────────────
  const allClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  const assignedClassIds = actor.teacher?.id
    ? new Set(
        (await prisma.classSubjectTeacher.findMany({
          where: { teacherId: actor.teacher.id },
          select: { classId: true },
        })).map((r) => r.classId)
      )
    : new Set<string>();

  if (classTeacherOfId) assignedClassIds.add(classTeacherOfId);

  const ownClass      = allClasses.filter((c) => c.id === classTeacherOfId);
  const otherAssigned = allClasses.filter(
    (c) => c.id !== classTeacherOfId && assignedClassIds.has(c.id)
  );
  const isWideAccess  = actor.isPrincipal ||
    actor.roles.some((r) => ["DIRECTOR", "EXAM_OFFICER"].includes(r.role));
  const otherAll      = isWideAccess
    ? allClasses.filter((c) => c.id !== classTeacherOfId && !assignedClassIds.has(c.id))
    : [];

  const classes = [...ownClass, ...otherAssigned, ...otherAll];

  if (classes.length === 0) {
    return (
      <MarksheetPageClient periods={allPeriods} activePeriodId={currentPeriodId}>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink mb-1">Mark Sheets</h1>
          <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
            You have no class assignments yet. Contact the principal to be assigned to
            classes and subjects.
          </div>
        </div>
      </MarksheetPageClient>
    );
  }

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId) ?? classes[0];
  const framework2     = selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR";

  // ── CBE path ──────────────────────────────────────────────────────────────
  if (framework2 === "CBE") {
    const cbeFramework = await db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId, type: "CBE", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    const hasLearningAreas = cbeFramework
      ? (await db.learningArea.count({
          where: { schoolId: user.schoolId, frameworkId: cbeFramework.id },
        })) > 0
      : false;

    const canEdit =
      actor.isPrincipal ||
      (classTeacherOfId === defaultClassId &&
        actor.roles.some((r) => r.role === "CLASS_TEACHER")) ||
      actor.roles.some((r) =>
        ["SUBJECT_TEACHER", "EXAM_OFFICER", "DIRECTOR"].includes(r.role)
      );

    // Collect CBE periods separately
    const cbePeriods: typeof allPeriods = framework
      ? allPeriods
      : await (async () => {
          const cbeF = await db.assessmentFramework.findFirst({
            where: { schoolId: user.schoolId, type: "CBE", isActive: true },
            select: { id: true },
          }) as { id: string } | null;
          if (!cbeF) return [];
          return db.assessmentPeriod.findMany({
            where: { schoolId: user.schoolId, frameworkId: cbeF.id },
            orderBy: [{ academicYear: "desc" }, { term: "desc" }],
            select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
          });
        })();

    return (
      <MarksheetPageClient periods={cbePeriods} activePeriodId={currentPeriodId}>
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">Mark Sheets</h1>
            <p className="text-sm text-slate mt-0.5">
              {canEdit
                ? hasLearningAreas
                  ? "CBE Junior — tap cells to record performance levels."
                  : "CBE Pathway — enter SBA and exam scores."
                : "View-only — contact the principal to be assigned an entry role."}
            </p>
          </div>
          {hasLearningAreas ? (
            <CbeJuniorGrid
              classes={classes.map((c) => ({ id: c.id, name: c.name }))}
              defaultClassId={defaultClassId}
              lockClass={classes.length === 1}
              readOnly={!canEdit}
            />
          ) : (
            <CbePathwayGrid
              classes={classes.map((c) => ({ id: c.id, name: c.name }))}
              defaultClassId={defaultClassId}
              lockClass={classes.length === 1}
              readOnly={!canEdit}
            />
          )}
        </div>
      </MarksheetPageClient>
    );
  }

  // ── 8-4-4 path ───────────────────────────────────────────────────────────
  const allSubjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true, departmentId: true },
  });

  const viewableSubjects = allSubjects.filter(
    (s) => canViewMarksheet(actor, s.id) || deptSubjectIds.has(s.id)
  );

  const defaultSubjectId = searchParams.subjectId ?? "";

  const editAllowed = defaultSubjectId
    ? canEnterMarks(actor, defaultSubjectId) || deptSubjectIds.has(defaultSubjectId)
    : false;

  const canManagePapers =
    actor.isPrincipal ||
    actor.roles.some((r) => ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role));

  if (viewableSubjects.length === 0) {
    return (
      <MarksheetPageClient periods={allPeriods} activePeriodId={currentPeriodId}>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink mb-1">Mark Sheets</h1>
          <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
            You don&apos;t have access to any subject marksheets yet. Contact the principal
            to be assigned a subject role.
          </div>
        </div>
      </MarksheetPageClient>
    );
  }

  return (
    <MarksheetPageClient periods={allPeriods} activePeriodId={currentPeriodId}>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mark Sheets</h1>
          <p className="text-sm text-slate mt-0.5">
            {editAllowed
              ? "Enter and update scores for your assigned subjects."
              : "View-only — you don't have edit access for this subject."}
          </p>
        </div>
        <MarksheetGrid
          classes={classes.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
          subjects={viewableSubjects}
          defaultClassId={defaultClassId}
          defaultSubjectId={defaultSubjectId}
          lockClass={classes.length === 1}
          readOnly={!editAllowed}
          canManagePapers={canManagePapers}
        />
        {currentPeriodId && defaultClassId && (
          <DoneBar role="teacher" classId={defaultClassId} periodId={currentPeriodId} />
        )}
        {currentPeriodId && defaultClassId && <div className="h-20" />}
      </div>
    </MarksheetPageClient>
  );
}
