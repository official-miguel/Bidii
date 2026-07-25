import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MarksheetGrid from "@/components/assessment/MarksheetGrid";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import CbePathwayGrid from "@/components/assessment/CbePathwayGrid";
import { resolveAssessmentActor, canEnterMarks, canViewMarksheet } from "@/lib/assessment/auth844";
import DoneBar from "@/components/assessment/DoneBar";

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

  // Resolve current period for DoneBar.
  const currentPeriod = await db.assessmentPeriod.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
    select: { id: true },
  }) as { id: string } | null;
  const currentPeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

  // All classes the teacher is assigned to (via ClassSubjectTeacher), plus
  // their own class-teacher class if set. Own class always comes first.
  const allClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  // Classes this teacher is assigned to teach at least one subject in.
  const assignedClassIds = actor.teacher?.id
    ? new Set(
        (await prisma.classSubjectTeacher.findMany({
          where: { teacherId: actor.teacher.id },
          select: { classId: true },
        })).map((r) => r.classId)
      )
    : new Set<string>();

  if (classTeacherOfId) assignedClassIds.add(classTeacherOfId);

  // Build ordered class list: own class first, then others alphabetically.
  const ownClass    = allClasses.filter((c) => c.id === classTeacherOfId);
  const otherAssigned = allClasses.filter(
    (c) => c.id !== classTeacherOfId && assignedClassIds.has(c.id)
  );
  // DIRECTOR / EXAM_OFFICER can see all classes.
  const isWideAccess = actor.isPrincipal ||
    actor.roles.some((r) => ["DIRECTOR", "EXAM_OFFICER"].includes(r.role));
  const otherAll = isWideAccess
    ? allClasses.filter((c) => c.id !== classTeacherOfId && !assignedClassIds.has(c.id))
    : [];

  const classes = [...ownClass, ...otherAssigned, ...otherAll];

  if (classes.length === 0) {
    return (
      <div>
        <h1 className="font-display text-xl font-semibold text-ink mb-1">Mark Sheets</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          You have no class assignments yet. Contact the principal to be assigned to classes and subjects.
        </div>
      </div>
    );
  }

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId) ?? classes[0];
  const framework      = selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR";

  // ── CBE path ──────────────────────────────────────────────────────────────
  if (framework === "CBE") {
    const cbeFramework = await db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId, type: "CBE", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    const hasLearningAreas = cbeFramework
      ? (await db.learningArea.count({ where: { schoolId: user.schoolId, frameworkId: cbeFramework.id } })) > 0
      : false;

    const canEdit = actor.isPrincipal ||
      (classTeacherOfId === defaultClassId && actor.roles.some((r) => r.role === "CLASS_TEACHER")) ||
      actor.roles.some((r) => ["SUBJECT_TEACHER", "EXAM_OFFICER", "DIRECTOR"].includes(r.role));

    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mark Sheets</h1>
          <p className="text-sm text-slate mt-0.5">
            {canEdit
              ? hasLearningAreas ? "CBE Junior — tap cells to record performance levels." : "CBE Pathway — enter SBA and exam scores."
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
    );
  }

  // ── 8-4-4 path ───────────────────────────────────────────────────────────
  // Fetch all subjects viewable by this teacher — ExamFilterBar filters by
  // applicableForms internally, so no pre-filtering by form here.
  const allSubjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true, departmentId: true },
  });

  // A teacher can VIEW a marksheet if:
  //   • auth844 canViewMarksheet (AssessmentRole-based), OR
  //   • the subject belongs to their primary department
  const viewableSubjects = allSubjects.filter(
    (s) => canViewMarksheet(actor, s.id) || deptSubjectIds.has(s.id)
  );

  const defaultSubjectId = searchParams.subjectId ?? "";

  // Can EDIT: auth844 canEnterMarks, OR HOD of the subject's department
  const editAllowed = defaultSubjectId
    ? (canEnterMarks(actor, defaultSubjectId) || deptSubjectIds.has(defaultSubjectId))
    : false;

  // Can manage papers (add/delete columns): HOD, Exam Officer, Director
  const canManagePapers =
    actor.isPrincipal ||
    actor.roles.some((r) => ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role));

  if (viewableSubjects.length === 0) {
    return (
      <div>
        <h1 className="font-display text-xl font-semibold text-ink mb-1">Mark Sheets</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          You don&apos;t have access to any subject marksheets yet. Contact the principal to
          be assigned a subject role.
        </div>
      </div>
    );
  }

  return (
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
  );
}
