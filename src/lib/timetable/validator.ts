/**
 * src/lib/timetable/validator.ts
 *
 * Comprehensive validation system for generated timetables.
 * Validates ALL constraints before publishing and triggers automatic
 * regeneration until all checks pass.
 */

import type { GeneratedSlot, ValidationError } from "./deterministicEngine";
import type { TemplateColumn } from "./deterministicEngine";
import { TimetableSession } from "@prisma/client";
import { validateSessionConstraints } from "./sessionAllocator";

export type ValidationRule =
  | "NO_TEACHER_DOUBLE_BOOKING"
  | "NO_CLASS_DOUBLE_BOOKING"
  | "COMPLETE_LESSON_COUNT"
  | "TEACHER_ASSIGNMENT_INTEGRITY"
  | "SUBJECT_SELECTION_CORRECTNESS"
  | "SESSION_CONSTRAINTS"
  | "TEACHER_AVAILABILITY"
  | "FORMAT_COMPLIANCE"
  | "DOUBLE_LESSON_CONSECUTIVE";

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationIssue = {
  rule: ValidationRule;
  severity: ValidationSeverity;
  message: string;
  affectedClasses?: string[];
  affectedTeachers?: string[];
  affectedSubjects?: string[];
  dayOfWeek?: number;
  period?: number;
  details?: any;
};

export type ValidationReport = {
  valid: boolean;
  passedRules: ValidationRule[];
  failedRules: ValidationRule[];
  issues: ValidationIssue[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
  };
  timestamp: Date;
};

export type ValidatorInput = {
  slots: GeneratedSlot[];
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; code: string; name: string; internalCode: number }>;
  teachers: Array<{ id: string; name: string }>;
  requirements: Array<{ classId: string; subjectId: string; lessonsPerWeek: number }>;
  teacherAssignments: Array<{ classId: string; subjectId: string; teacherId: string }>;
  teacherUnavailability: Array<{ teacherId: string; dayOfWeek: number; period: number }>;
  studentSelections: Array<{ studentId: string; classId: string; subjectId: string }>;
  sessionPreferences: Array<{
    subjectCode: string;
    preferredSession: TimetableSession;
    isHard: boolean;
  }>;
  templateColumns: TemplateColumn[];
  operatingDays: number[];
};

/**
 * Main validation function - runs all checks
 */
export function validateTimetable(input: ValidatorInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const passedRules: Set<ValidationRule> = new Set();
  const failedRules: Set<ValidationRule> = new Set();

  // Run all validation checks
  checkTeacherDoubleBooking(input, issues, passedRules, failedRules);
  checkClassDoubleBooking(input, issues, passedRules, failedRules);
  checkCompleteLessonCount(input, issues, passedRules, failedRules);
  checkTeacherAssignmentIntegrity(input, issues, passedRules, failedRules);
  checkSubjectSelectionCorrectness(input, issues, passedRules, failedRules);
  checkSessionConstraints(input, issues, passedRules, failedRules);
  checkTeacherAvailability(input, issues, passedRules, failedRules);
  checkFormatCompliance(input, issues, passedRules, failedRules);
  checkDoubleLessonConsecutive(input, issues, passedRules, failedRules);

  const errors = issues.filter((i) => i.severity === "ERROR").length;
  const warnings = issues.filter((i) => i.severity === "WARNING").length;

  return {
    valid: failedRules.size === 0,
    passedRules: Array.from(passedRules),
    failedRules: Array.from(failedRules),
    issues,
    summary: {
      totalChecks: passedRules.size + failedRules.size,
      passed: passedRules.size,
      failed: failedRules.size,
      errors,
      warnings,
    },
    timestamp: new Date(),
  };
}

/**
 * Check: No teacher is teaching multiple classes at the same time
 */
function checkTeacherDoubleBooking(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_TEACHER_DOUBLE_BOOKING";
  const teacherSlots = new Map<string, Set<string>>();

  for (const slot of input.slots) {
    const key = `${slot.dayOfWeek}-${slot.period}`;
    if (!teacherSlots.has(slot.teacherId)) {
      teacherSlots.set(slot.teacherId, new Set());
    }

    if (teacherSlots.get(slot.teacherId)!.has(key)) {
      const teacher = input.teachers.find((t) => t.id === slot.teacherId);
      issues.push({
        rule,
        severity: "ERROR",
        message: `Teacher ${teacher?.name || slot.teacherId} is double-booked on day ${slot.dayOfWeek} period ${slot.period}`,
        affectedTeachers: [slot.teacherId],
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
      failed.add(rule);
      return;
    }

    teacherSlots.get(slot.teacherId)!.add(key);
  }

  passed.add(rule);
}

/**
 * Check: No class has multiple subjects at the same time
 */
function checkClassDoubleBooking(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_CLASS_DOUBLE_BOOKING";
  const classSlots = new Map<string, Set<string>>();

  for (const slot of input.slots) {
    const key = `${slot.dayOfWeek}-${slot.period}`;
    if (!classSlots.has(slot.classId)) {
      classSlots.set(slot.classId, new Set());
    }

    if (classSlots.get(slot.classId)!.has(key)) {
      const cls = input.classes.find((c) => c.id === slot.classId);
      issues.push({
        rule,
        severity: "ERROR",
        message: `Class ${cls?.name || slot.classId} has multiple subjects scheduled on day ${slot.dayOfWeek} period ${slot.period}`,
        affectedClasses: [slot.classId],
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
      failed.add(rule);
      return;
    }

    classSlots.get(slot.classId)!.add(key);
  }

  passed.add(rule);
}

/**
 * Check: Every class receives full required weekly lesson count per subject
 */
function checkCompleteLessonCount(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "COMPLETE_LESSON_COUNT";
  const scheduled = new Map<string, number>();

  // Count scheduled lessons
  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    scheduled.set(key, (scheduled.get(key) ?? 0) + 1);
  }

  let hasError = false;

  // Check against requirements
  for (const req of input.requirements) {
    const key = `${req.classId}-${req.subjectId}`;
    const count = scheduled.get(key) ?? 0;

    if (count < req.lessonsPerWeek) {
      const cls = input.classes.find((c) => c.id === req.classId);
      const subject = input.subjects.find((s) => s.id === req.subjectId);

      issues.push({
        rule,
        severity: "ERROR",
        message: `${cls?.name || req.classId} has incomplete lessons for ${subject?.code || req.subjectId}: ${count}/${req.lessonsPerWeek} scheduled`,
        affectedClasses: [req.classId],
        affectedSubjects: [req.subjectId],
        details: { scheduled: count, required: req.lessonsPerWeek },
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Teacher assignments stay exactly as configured (never auto-swapped)
 */
function checkTeacherAssignmentIntegrity(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "TEACHER_ASSIGNMENT_INTEGRITY";
  const assignmentMap = new Map<string, string>();

  for (const assign of input.teacherAssignments) {
    assignmentMap.set(`${assign.classId}-${assign.subjectId}`, assign.teacherId);
  }

  let hasError = false;

  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    const expectedTeacher = assignmentMap.get(key);

    if (expectedTeacher && expectedTeacher !== slot.teacherId) {
      const cls = input.classes.find((c) => c.id === slot.classId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);
      const expectedT = input.teachers.find((t) => t.id === expectedTeacher);
      const actualT = input.teachers.find((t) => t.id === slot.teacherId);

      issues.push({
        rule,
        severity: "ERROR",
        message: `${cls?.name || slot.classId} ${subject?.code || slot.subjectId}: assigned to ${actualT?.name || slot.teacherId} but should be ${expectedT?.name || expectedTeacher}`,
        affectedClasses: [slot.classId],
        affectedTeachers: [expectedTeacher, slot.teacherId],
        affectedSubjects: [slot.subjectId],
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Students only scheduled into subjects they selected
 */
function checkSubjectSelectionCorrectness(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "SUBJECT_SELECTION_CORRECTNESS";

  // Build map of valid (class, subject) pairs from student selections
  const validPairs = new Map<string, Set<string>>();

  for (const selection of input.studentSelections) {
    if (!validPairs.has(selection.classId)) {
      validPairs.set(selection.classId, new Set());
    }
    validPairs.get(selection.classId)!.add(selection.subjectId);
  }

  // If no student selections provided, assume all subjects are valid for all classes
  if (input.studentSelections.length === 0) {
    passed.add(rule);
    return;
  }

  let hasError = false;

  // Check that scheduled slots match student selections
  for (const slot of input.slots) {
    const validSubjects = validPairs.get(slot.classId);

    // If class has student selections, verify subject is valid
    if (validSubjects && !validSubjects.has(slot.subjectId)) {
      const cls = input.classes.find((c) => c.id === slot.classId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);

      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls?.name || slot.classId} scheduled for ${subject?.code || slot.subjectId} but no students selected it`,
        affectedClasses: [slot.classId],
        affectedSubjects: [slot.subjectId],
      });
      hasError = true;
    }
  }

  // Rule produces warnings only; always marks as passed
  passed.add(rule);
}

/**
 * Check: Session constraints (hard preferences) are satisfied
 */
function checkSessionConstraints(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "SESSION_CONSTRAINTS";

  const slotsWithCodes = input.slots.map((slot) => {
    const subject = input.subjects.find((s) => s.id === slot.subjectId);
    return {
      ...slot,
      subjectCode: subject?.code || "",
    };
  });

  const violations = validateSessionConstraints(
    slotsWithCodes,
    input.sessionPreferences.map((p) => ({
      subjectCode: p.subjectCode,
      subjectName: "",
      requiredSession: p.preferredSession,
      isHard: p.isHard,
    })),
    input.templateColumns
  );

  if (violations.length > 0) {
    for (const violation of violations) {
      for (const v of violation.violations) {
        issues.push({
          rule,
          severity: "ERROR",
          message: `${v.subjectCode} scheduled in ${v.actualSession} session but must be in ${v.expectedSession} session (period ${v.period})`,
          affectedSubjects: [v.subjectCode],
          period: v.period,
          details: {
            expected: v.expectedSession,
            actual: v.actualSession,
          },
        });
      }
    }
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Teachers only scheduled when available (respect unavailability)
 */
function checkTeacherAvailability(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "TEACHER_AVAILABILITY";
  const unavailabilityMap = new Map<string, Set<string>>();

  for (const unavail of input.teacherUnavailability) {
    const key = unavail.teacherId;
    if (!unavailabilityMap.has(key)) {
      unavailabilityMap.set(key, new Set());
    }
    unavailabilityMap.get(key)!.add(`${unavail.dayOfWeek}-${unavail.period}`);
  }

  let hasError = false;

  for (const slot of input.slots) {
    const unavailable = unavailabilityMap.get(slot.teacherId);
    const slotKey = `${slot.dayOfWeek}-${slot.period}`;

    if (unavailable?.has(slotKey)) {
      const teacher = input.teachers.find((t) => t.id === slot.teacherId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);

      issues.push({
        rule,
        severity: "ERROR",
        message: `${teacher?.name || slot.teacherId} scheduled for ${subject?.code || slot.subjectId} on day ${slot.dayOfWeek} period ${slot.period} but is marked unavailable`,
        affectedTeachers: [slot.teacherId],
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Every class has at least as many scheduled lessons as its total
 * lesson requirement (not necessarily every period — free periods are fine).
 */
function checkFormatCompliance(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "FORMAT_COMPLIANCE";

  // Total lessons required per class across all subjects
  const requiredPerClass = new Map<string, number>();
  for (const req of input.requirements) {
    requiredPerClass.set(
      req.classId,
      (requiredPerClass.get(req.classId) ?? 0) + req.lessonsPerWeek
    );
  }

  for (const cls of input.classes) {
    const required = requiredPerClass.get(cls.id) ?? 0;
    const scheduled = input.slots.filter((s) => s.classId === cls.id).length;

    if (required > 0 && scheduled < required) {
      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls.name} has ${scheduled}/${required} required lessons scheduled`,
        affectedClasses: [cls.id],
        details: { scheduled, required },
      });
    }
  }

  // Rule produces warnings only — never a hard failure
  passed.add(rule);
}

/**
 * Check: Double lessons are scheduled consecutively
 */
function checkDoubleLessonConsecutive(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "DOUBLE_LESSON_CONSECUTIVE";

  // Group slots by class and subject and day
  const grouped = new Map<string, GeneratedSlot[]>();

  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}-${slot.dayOfWeek}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(slot);
  }

  // Check each group
  for (const [key, slots] of grouped) {
    if (slots.length < 2) continue; // Not a double lesson

    // Sort by period
    const sorted = [...slots].sort((a, b) => a.period - b.period);

    // Check if consecutive
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].period !== sorted[i - 1].period + 1) {
        const [classId, subjectId, dayOfWeek] = key.split("-");
        const cls = input.classes.find((c) => c.id === classId);
        const subject = input.subjects.find((s) => s.id === subjectId);

        issues.push({
          rule,
          severity: "WARNING",
          message: `${cls?.name || classId} ${subject?.code || subjectId} has non-consecutive lessons on day ${dayOfWeek} (periods ${sorted.map((s) => s.period).join(", ")})`,
          affectedClasses: [classId],
          affectedSubjects: [subjectId],
          dayOfWeek: parseInt(dayOfWeek),
        });
        // Severity is WARNING; this does not block scheduling
      }
    }
  }

  // Rule produces warnings only — never a hard failure
  passed.add(rule);
}

/**
 * Generate human-readable validation summary
 */
export function generateValidationSummary(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push(`Timetable Validation Report (${report.timestamp.toISOString()})`);
  lines.push("=".repeat(60));
  lines.push("");

  if (report.valid) {
    lines.push("✓ PASSED - Timetable is valid and ready to publish");
  } else {
    lines.push("✗ FAILED - Timetable has validation errors");
  }

  lines.push("");
  lines.push(`Total Checks: ${report.summary.totalChecks}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push(`Errors: ${report.summary.errors}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push("");

  if (report.issues.length > 0) {
    lines.push("Issues:");
    lines.push("-".repeat(60));

    for (const issue of report.issues) {
      const icon = issue.severity === "ERROR" ? "✗" : issue.severity === "WARNING" ? "⚠" : "ℹ";
      lines.push(`${icon} [${issue.severity}] ${issue.rule}`);
      lines.push(`  ${issue.message}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
