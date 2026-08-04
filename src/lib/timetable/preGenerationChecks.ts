/**
 * src/lib/timetable/preGenerationChecks.ts
 *
 * Pre-generation validation and checks that run BEFORE attempting
 * to generate a timetable. Includes stream balancing verification.
 */

import { analyzeStreamBalance, type BalancingConfig } from "./streamBalancer";
import type { GroupPayloadDescriptor } from "./engineHelpers";

export type PreGenerationIssue = {
  type:
    | "STREAM_IMBALANCE"
    | "MISSING_TEACHER_ASSIGNMENT"
    | "NO_STUDENTS_IN_SUBJECT"
    | "INSUFFICIENT_CAPACITY"
    | "EMPTY_SLOTS"
    | "CONFIGURATION_ERROR"
    | "DUPLICATE_GROUP_ANCHOR";
  severity: "BLOCKING" | "WARNING" | "INFO";
  message: string;
  affectedSubject?: string;
  affectedClasses?: string[];
  requiresApproval?: boolean;
  suggestedAction?: string;
};

export type PreGenerationReport = {
  canProceed: boolean;
  requiresApproval: boolean;
  issues: PreGenerationIssue[];
  summary: {
    blockingIssues: number;
    warnings: number;
    approvalsNeeded: number;
  };
};

export type PreGenerationInput = {
  subjects: Array<{
    id: string;
    code: string;
    name: string;
    type: "CORE" | "ELECTIVE";
    /** Whether this subject uses back-to-back double periods. Default false. */
    doubleLesson?: boolean;
  }>;
  classes: Array<{
    id: string;
    name: string;
    form: number;
    stream: string | null;
  }>;
  requirements: Array<{
    classId: string;
    subjectId: string;
    lessonsPerWeek: number;
  }>;
  teacherAssignments: Array<{
    classId: string;
    subjectId: string;
    teacherId: string;
  }>;
  studentSelections: Array<{
    studentId: string;
    classId: string;
    subjectId: string;
  }>;
  templateColumns: number; // Total lesson slots per day
  operatingDays: number[];
  /**
   * Elective group descriptors — used to check that no two groups in the same
   * form scope share the same anchor subject.  Optional: omit when not available
   * (the check is simply skipped).
   */
  groups?: GroupPayloadDescriptor[];
};

/**
 * Run all pre-generation checks
 */
export function runPreGenerationChecks(
  input: PreGenerationInput,
  balancingConfig: BalancingConfig = {
    maxAbsoluteDifference: 5,
    maxPercentageDifference: 0.2,
    minStreamSize: 10,
    maxStreamSize: 50,
  }
): PreGenerationReport {
  const issues: PreGenerationIssue[] = [];

  // Check for duplicate anchor subjects across groups in the same form scope
  if (input.groups && input.groups.length > 0) {
    checkGroupAnchorConflicts(input.groups, input.subjects, issues);
  }

  // Check stream balance for elective subjects
  checkStreamBalance(input, balancingConfig, issues);

  // Check teacher assignments
  checkTeacherAssignments(input, issues);

  // Check student selections
  checkStudentSelections(input, issues);

  // Check capacity (over-allocation)
  checkCapacity(input, issues);

  // Check for under-allocation (classes with more slots than lessons)
  checkEmptySlots(input, issues);

  // Calculate summary
  const blockingIssues = issues.filter((i) => i.severity === "BLOCKING").length;
  const warnings = issues.filter((i) => i.severity === "WARNING").length;
  const approvalsNeeded = issues.filter((i) => i.requiresApproval).length;

  return {
    canProceed: blockingIssues === 0,
    requiresApproval: approvalsNeeded > 0,
    issues,
    summary: {
      blockingIssues,
      warnings,
      approvalsNeeded,
    },
  };
}

/**
 * Check for any groups that still share an anchor after auto-resolution.
 * This only fires when a group has ALL its subjects already claimed as
 * anchors by other groups — an edge case that resolveGroupAnchors cannot fix
 * without changing group membership.  Surfaced as INFO (not BLOCKING) because
 * the timetable can still be generated; the ambiguous group will share slot
 * counts with another group, which may cause uneven scheduling.
 */
function checkGroupAnchorConflicts(
  groups: GroupPayloadDescriptor[],
  subjects: PreGenerationInput["subjects"],
  issues: PreGenerationIssue[],
): void {
  const subjectName = new Map(subjects.map((s) => [s.id, s.code]));
  const anchorSeen = new Map<string, { groupName: string; groupId: string }>();

  for (const group of groups) {
    if (group.subjectIds.length === 0 || group.classIds.length === 0) continue;
    const anchorSubjectId = group.subjectIds[0];
    const prior = anchorSeen.get(anchorSubjectId);

    if (prior) {
      const subCode = subjectName.get(anchorSubjectId) ?? anchorSubjectId;
      issues.push({
        type: "DUPLICATE_GROUP_ANCHOR",
        severity: "INFO",
        message:
          `Groups "${prior.groupName}" and "${group.name}" share anchor subject ${subCode}. ` +
          `This happens when both groups contain only subjects that are already anchors elsewhere. ` +
          `Consider splitting the groups or changing their membership so each starts with a unique subject.`,
        affectedSubject: anchorSubjectId,
        suggestedAction:
          `Review group membership in Timetable → Requirements and ensure each group ` +
          `has at least one subject not used as a first member in any sibling group.`,
      });
    } else {
      anchorSeen.set(anchorSubjectId, { groupName: group.name, groupId: group.groupId });
    }
  }
}

/**
 * Check stream balance for elective subjects
 */
function checkStreamBalance(
  input: PreGenerationInput,
  config: BalancingConfig,
  issues: PreGenerationIssue[]
): void {
  // Group classes by form (streams within same form)
  const classesByForm = new Map<number, typeof input.classes>();

  for (const cls of input.classes) {
    if (!classesByForm.has(cls.form)) {
      classesByForm.set(cls.form, []);
    }
    classesByForm.get(cls.form)!.push(cls);
  }

  // Check each elective subject
  const electiveSubjects = input.subjects.filter((s) => s.type === "ELECTIVE");

  for (const subject of electiveSubjects) {
    // Get classes teaching this subject
    const classesForSubject = input.classes.filter((cls) =>
      input.requirements.some((r) => r.classId === cls.id && r.subjectId === subject.id)
    );

    if (classesForSubject.length <= 1) continue; // No balance issue if only one stream

    // Group by form
    const form = classesForSubject[0]?.form;
    if (!form) continue;

    const streamsInForm = classesForSubject.filter((c) => c.form === form);
    if (streamsInForm.length <= 1) continue;

    // Get student counts per stream
    const streamOptions = streamsInForm.map((cls) => {
      const studentsInClass = input.studentSelections.filter(
        (sel) => sel.classId === cls.id && sel.subjectId === subject.id
      );

      return {
        classId: cls.id,
        className: cls.name,
        stream: cls.stream || "Main",
        currentCount: studentsInClass.length,
        capacity: 50, // Default
      };
    });

    const students = input.studentSelections
      .filter((sel) => sel.subjectId === subject.id)
      .map((sel) => ({
        studentId: sel.studentId,
        name: "",
        currentClassId: sel.classId,
        currentClassName:
          input.classes.find((c) => c.id === sel.classId)?.name || "",
      }));

    // Analyze balance
    const analysis = analyzeStreamBalance(subject, streamOptions, students, config);

    if (!analysis.balanced) {
      issues.push({
        type: "STREAM_IMBALANCE",
        severity: analysis.requiresApproval ? "WARNING" : "INFO",
        message: `${subject.code}: Stream sizes are imbalanced (${analysis.warnings.join("; ")})`,
        affectedSubject: subject.id,
        affectedClasses: streamOptions.map((s) => s.classId),
        requiresApproval: analysis.requiresApproval,
        suggestedAction: analysis.recommendations[0]?.description,
      });
    }
  }
}

/**
 * Check that all requirements have teacher assignments
 */
function checkTeacherAssignments(
  input: PreGenerationInput,
  issues: PreGenerationIssue[]
): void {
  const assignmentMap = new Map<string, boolean>();

  for (const assign of input.teacherAssignments) {
    assignmentMap.set(`${assign.classId}-${assign.subjectId}`, true);
  }

  for (const req of input.requirements) {
    const key = `${req.classId}-${req.subjectId}`;
    if (!assignmentMap.has(key)) {
      const cls = input.classes.find((c) => c.id === req.classId);
      const subject = input.subjects.find((s) => s.id === req.subjectId);
      const isElective = subject?.type === "ELECTIVE";

      issues.push({
        type: "MISSING_TEACHER_ASSIGNMENT",
        severity: "BLOCKING",
        message: `${cls?.name || req.classId} needs ${subject?.code || req.subjectId} but no teacher is assigned`,
        affectedSubject: req.subjectId,
        affectedClasses: [req.classId],
        suggestedAction: isElective
          ? "Open the class profile for this class and assign a teacher to this elective subject in the elective group section"
          : "Go to Timetable → Subject Teachers and assign a teacher to this subject for this class",
      });
    }
  }
}

/**
 * Check that subjects have students (for electives)
 */
function checkStudentSelections(
  input: PreGenerationInput,
  issues: PreGenerationIssue[]
): void {
  // Group selections by subject
  const selectionsPerSubject = new Map<string, number>();

  for (const sel of input.studentSelections) {
    selectionsPerSubject.set(
      sel.subjectId,
      (selectionsPerSubject.get(sel.subjectId) ?? 0) + 1
    );
  }

  // Check elective subjects
  const electiveSubjects = input.subjects.filter((s) => s.type === "ELECTIVE");

  for (const subject of electiveSubjects) {
    const count = selectionsPerSubject.get(subject.id) ?? 0;

    if (count === 0) {
      // Check if subject has requirements
      const hasRequirement = input.requirements.some((r) => r.subjectId === subject.id);

      if (hasRequirement) {
        issues.push({
          type: "NO_STUDENTS_IN_SUBJECT",
          severity: "WARNING",
          message: `${subject.code} is an elective but no students have selected it`,
          affectedSubject: subject.id,
          suggestedAction: "Remove subject from timetable or add student selections",
        });
      }
    }
  }
}

/**
 * Check if there's sufficient capacity for all lessons.
 *
 * Double-lesson subjects occupy 2 physical slots per lessonsPerWeek unit
 * (e.g. 4 lessonsPerWeek of a double subject = 8 physical slots).
 * We use physical slot counts for the comparison so the check matches what
 * the solver actually tries to place.
 */
function checkCapacity(
  input: PreGenerationInput,
  issues: PreGenerationIssue[]
): void {
  const totalCapacityPerClass =
    input.templateColumns * input.operatingDays.length;

  const doubleSubjectIds = new Set(
    input.subjects.filter((s) => s.doubleLesson).map((s) => s.id)
  );

  for (const cls of input.classes) {
    const classRequirements = input.requirements.filter(
      (r) => r.classId === cls.id
    );

    // Count physical slots: doubles occupy 2 slots per lessonsPerWeek unit
    const totalRequired = classRequirements.reduce((sum, r) => {
      const multiplier = doubleSubjectIds.has(r.subjectId) ? 2 : 1;
      return sum + r.lessonsPerWeek * multiplier;
    }, 0);

    if (totalRequired > totalCapacityPerClass) {
      issues.push({
        type: "INSUFFICIENT_CAPACITY",
        severity: "BLOCKING",
        message: `${cls.name} requires ${totalRequired} physical slots/week but only ${totalCapacityPerClass} available (${Math.round((totalRequired / totalCapacityPerClass) * 100)}% utilisation — double-lesson subjects count as 2 slots each)`,
        affectedClasses: [cls.id],
        suggestedAction:
          "Reduce lesson requirements, convert double-lesson subjects to singles, or increase template capacity",
      });
    } else if (totalRequired > totalCapacityPerClass * 0.95) {
      issues.push({
        type: "INSUFFICIENT_CAPACITY",
        severity: "WARNING",
        message: `${cls.name} is at ${Math.round((totalRequired / totalCapacityPerClass) * 100)}% capacity - very tight fit (${totalRequired}/${totalCapacityPerClass} physical slots)`,
        affectedClasses: [cls.id],
        suggestedAction: "Consider adding buffer capacity for flexibility",
      });
    }
  }
}

/**
 * Check for classes that have fewer total lessons than available weekly slots.
 * Empty slots left unfilled make the timetable look incomplete and are usually
 * a sign that lesson requirements haven't been fully configured.
 */
function checkEmptySlots(
  input: PreGenerationInput,
  issues: PreGenerationIssue[]
): void {
  const totalCapacityPerClass =
    input.templateColumns * input.operatingDays.length;

  const doubleSubjectIds = new Set(
    input.subjects.filter((s) => s.doubleLesson).map((s) => s.id)
  );

  for (const cls of input.classes) {
    const classRequirements = input.requirements.filter(
      (r) => r.classId === cls.id
    );

    // Skip classes that have no requirements at all — covered by teacher check
    if (classRequirements.length === 0) continue;

    // Use physical slot count so the number matches what the solver places
    const totalRequired = classRequirements.reduce((sum, r) => {
      const multiplier = doubleSubjectIds.has(r.subjectId) ? 2 : 1;
      return sum + r.lessonsPerWeek * multiplier;
    }, 0);

    const emptySlots = totalCapacityPerClass - totalRequired;

    if (emptySlots > 0) {
      issues.push({
        type: "EMPTY_SLOTS",
        severity: "WARNING",
        message: `${cls.name} has ${emptySlots} slot${emptySlots !== 1 ? "s" : ""} per week with no lesson assigned (${totalRequired} physical slots required, ${totalCapacityPerClass} available)`,
        affectedClasses: [cls.id],
        suggestedAction:
          "Add more subjects or increase lessons-per-week for existing subjects to fill the gap",
      });
    }
  }
}

/**
 */
export function formatPreGenerationReport(report: PreGenerationReport): string {
  const lines: string[] = [];

  lines.push("Pre-Generation Validation Report");
  lines.push("=".repeat(60));
  lines.push("");

  if (report.canProceed && !report.requiresApproval) {
    lines.push("✓ All checks passed - ready to generate");
  } else if (report.canProceed && report.requiresApproval) {
    lines.push("⚠ Can proceed but requires approval for some items");
  } else {
    lines.push("✗ Cannot proceed - blocking issues found");
  }

  lines.push("");
  lines.push(`Blocking Issues: ${report.summary.blockingIssues}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push(`Approvals Needed: ${report.summary.approvalsNeeded}`);
  lines.push("");

  if (report.issues.length > 0) {
    lines.push("Issues:");
    lines.push("-".repeat(60));

    for (const issue of report.issues) {
      const icon =
        issue.severity === "BLOCKING"
          ? "✗"
          : issue.severity === "WARNING"
          ? "⚠"
          : "ℹ";
      const approval = issue.requiresApproval ? " [REQUIRES APPROVAL]" : "";

      lines.push(`${icon} [${issue.severity}] ${issue.type}${approval}`);
      lines.push(`  ${issue.message}`);

      if (issue.suggestedAction) {
        lines.push(`  → Suggestion: ${issue.suggestedAction}`);
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
