/**
 * src/lib/ai/timetableValidator.ts — Stage 2
 *
 * Multi-pass validation engine. Runs completely independently of the
 * scheduler — accepts any set of slots and the school's configuration
 * and returns a structured ValidationReport. Every check is a named,
 * independently pass/fail unit with actionable messages so the UI can
 * display a clear table and the administrator knows exactly what to fix.
 *
 * Passes (in order):
 *  1. CONFLICT_FREE        — no teacher or class double-booked
 *  2. SPECIAL_PERIOD       — no lesson scheduled in a blocked slot
 *  3. LESSON_COMPLETION    — every class receives its required weekly load
 *  4. DOUBLE_ADJACENCY     — double lessons are placed in consecutive periods
 *  5. WORKLOAD_COMPLIANCE  — no teacher exceeds their daily/weekly cap
 *  6. SUBJECT_SPREAD       — subjects meet their minSpreadDays requirement
 *  7. TEACHER_AVAILABILITY — no lesson in an unavailable slot
 *  8. POLICY_INTEGRITY     — no lesson on an inactive operating day
 */

// ── Types ─────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  pass:        string;          // which pass raised this
  severity:    ValidationSeverity;
  message:     string;
  classId?:    string;
  className?:  string;
  teacherId?:  string;
  teacherName?:string;
  subjectCode?:string;
  dayOfWeek?:  number;
  period?:     number;
  /** Concrete action the administrator should take. */
  action:      string;
};

export type ValidationPassResult = {
  name:       string;
  label:      string;
  passed:     boolean;
  issueCount: number;
  issues:     ValidationIssue[];
};

export type ValidationReport = {
  overallPassed: boolean;
  errorCount:    number;
  warningCount:  number;
  passes:        ValidationPassResult[];
  /** Flat list of all error-severity issues for quick scanning. */
  errors:        ValidationIssue[];
};

export type ValidatorSlot = {
  classId:   string;
  className: string;
  dayOfWeek: number;
  period:    number;
  subjectId: string;
  subjectCode: string;
  teacherId:  string;
  teacherName:string;
  room:       string | null;
  isDouble:   boolean;
};

export type ValidatorSubjectRequirement = {
  classId:      string;
  className:    string;
  subjectId:    string;
  subjectCode:  string;
  subjectName:  string;
  lessonsPerWeek: number;
  doubleLesson:   boolean;
  minSpreadDays:  number;
};

export type ValidatorConfig = {
  operatingDays:              number[];   // 0=Mon..6=Sun
  periodsPerDay:              number;
  blockedSlots:               Set<string>;
  maxLessonsPerTeacherPerDay: number;
  maxLessonsPerTeacherPerWeek?: number;   // optional cap
};

export type ValidatorTeacherAvailability = {
  teacherId:    string;
  unavailableSlots: Set<string>; // "day-period"
};

// ── Main validator ────────────────────────────────────────────────────────

export function validateTimetable(input: {
  slots:          ValidatorSlot[];
  requirements:   ValidatorSubjectRequirement[];
  config:         ValidatorConfig;
  availability:   ValidatorTeacherAvailability[];
}): ValidationReport {
  const { slots, requirements, config, availability } = input;
  const passes: ValidationPassResult[] = [];
  const unavMap = new Map<string, Set<string>>(
    availability.map((a) => [a.teacherId, a.unavailableSlots])
  );

  // ── Pass 1: Conflict-free ───────────────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const classOcc   = new Map<string, string>(); // "classId|day-p" → subjectCode
    const teacherOcc = new Map<string, string>(); // "teacherId|day-p" → className

    for (const s of slots) {
      const k     = `${s.dayOfWeek}-${s.period}`;
      const ck    = `${s.classId}|${k}`;
      const tk    = `${s.teacherId}|${k}`;

      if (classOcc.has(ck)) {
        issues.push({
          pass: "CONFLICT_FREE", severity: "error",
          message: `${s.className} has two subjects in period ${s.period} on day ${s.dayOfWeek} (${classOcc.get(ck)} and ${s.subjectCode}).`,
          classId: s.classId, className: s.className, dayOfWeek: s.dayOfWeek, period: s.period,
          action: `Remove one of the two subjects from ${s.className}'s slot — day ${s.dayOfWeek}, period ${s.period}.`,
        });
      } else { classOcc.set(ck, s.subjectCode); }

      if (teacherOcc.has(tk)) {
        issues.push({
          pass: "CONFLICT_FREE", severity: "error",
          message: `${s.teacherName} is double-booked in period ${s.period} on day ${s.dayOfWeek} (teaching ${teacherOcc.get(tk)} and ${s.className}).`,
          teacherId: s.teacherId, teacherName: s.teacherName, dayOfWeek: s.dayOfWeek, period: s.period,
          action: `Re-assign one class for ${s.teacherName} on day ${s.dayOfWeek}, period ${s.period} to a different teacher or slot.`,
        });
      } else { teacherOcc.set(tk, s.className); }
    }

    passes.push({ name: "CONFLICT_FREE", label: "No teacher or class conflicts", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 2: Special-period integrity ───────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    for (const s of slots) {
      if (config.blockedSlots.has(`${s.dayOfWeek}-${s.period}`)) {
        issues.push({
          pass: "SPECIAL_PERIOD", severity: "error",
          message: `${s.className} has ${s.subjectCode} in a special (blocked) period — day ${s.dayOfWeek}, period ${s.period}.`,
          classId: s.classId, className: s.className, subjectCode: s.subjectCode, dayOfWeek: s.dayOfWeek, period: s.period,
          action: `Move ${s.subjectCode} for ${s.className} out of the blocked slot (day ${s.dayOfWeek}, period ${s.period}).`,
        });
      }
    }
    passes.push({ name: "SPECIAL_PERIOD", label: "No lessons in blocked slots", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 3: Lesson completion ───────────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const placed = new Map<string, number>(); // "classId-subjectId" → count

    for (const s of slots) {
      const k = `${s.classId}-${s.subjectId}`;
      placed.set(k, (placed.get(k) ?? 0) + 1);
    }

    for (const req of requirements) {
      const k     = `${req.classId}-${req.subjectId}`;
      const count = placed.get(k) ?? 0;

      if (count < req.lessonsPerWeek) {
        const severity: ValidationSeverity = count === 0 ? "error" : "warning";
        issues.push({
          pass: "LESSON_COMPLETION", severity,
          message: `${req.className} only has ${count}/${req.lessonsPerWeek} periods of ${req.subjectCode} scheduled.`,
          classId: req.classId, className: req.className, subjectCode: req.subjectCode,
          action: count === 0
            ? `Assign a teacher to ${req.subjectCode} and regenerate, or manually add ${req.lessonsPerWeek} lessons.`
            : `Add ${req.lessonsPerWeek - count} more period(s) of ${req.subjectCode} to ${req.className}.`,
        });
      }
    }
    passes.push({ name: "LESSON_COMPLETION", label: "All required lessons scheduled", passed: issues.filter(i => i.severity === "error").length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 4: Double-lesson adjacency ─────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const doubles = slots.filter((s) => s.isDouble);

    // Group by class+subject+day
    type GroupKey = string;
    const groups = new Map<GroupKey, ValidatorSlot[]>();
    for (const s of doubles) {
      const k: GroupKey = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    }

    for (const [, group] of groups) {
      const periods = group.map((s) => s.period).sort((a, b) => a - b);
      for (let i = 0; i < periods.length - 1; i += 2) {
        if (periods[i + 1] !== periods[i] + 1) {
          const s = group[0];
          issues.push({
            pass: "DOUBLE_ADJACENCY", severity: "error",
            message: `${s.className} ${s.subjectCode} has non-consecutive double lessons on day ${s.dayOfWeek} (periods ${periods[i]} and ${periods[i+1]}).`,
            classId: s.classId, className: s.className, subjectCode: s.subjectCode, dayOfWeek: s.dayOfWeek,
            action: `Regenerate or manually move one lesson so the double for ${s.subjectCode} occupies periods ${periods[i]} and ${periods[i]+1}.`,
          });
        }
      }
    }
    passes.push({ name: "DOUBLE_ADJACENCY", label: "Double lessons are consecutive", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 5: Workload compliance ──────────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const teacherDayLoad  = new Map<string, Map<number, number>>();
    const teacherWeekLoad = new Map<string, number>();

    for (const s of slots) {
      // Daily
      if (!teacherDayLoad.has(s.teacherId)) teacherDayLoad.set(s.teacherId, new Map());
      const dm = teacherDayLoad.get(s.teacherId)!;
      dm.set(s.dayOfWeek, (dm.get(s.dayOfWeek) ?? 0) + 1);
      // Weekly
      teacherWeekLoad.set(s.teacherId, (teacherWeekLoad.get(s.teacherId) ?? 0) + 1);
    }

    for (const [tid, dayMap] of teacherDayLoad) {
      for (const [day, count] of dayMap) {
        if (count > config.maxLessonsPerTeacherPerDay) {
          const name = slots.find((s) => s.teacherId === tid)?.teacherName ?? tid;
          issues.push({
            pass: "WORKLOAD_COMPLIANCE", severity: "error",
            message: `${name} has ${count} lessons on day ${day}, exceeding the ${config.maxLessonsPerTeacherPerDay} lesson daily limit.`,
            teacherId: tid, teacherName: name, dayOfWeek: day,
            action: `Move ${count - config.maxLessonsPerTeacherPerDay} lesson(s) for ${name} on day ${day} to another day or assign a co-teacher.`,
          });
        }
      }
    }

    if (config.maxLessonsPerTeacherPerWeek) {
      for (const [tid, total] of teacherWeekLoad) {
        if (total > config.maxLessonsPerTeacherPerWeek) {
          const name = slots.find((s) => s.teacherId === tid)?.teacherName ?? tid;
          issues.push({
            pass: "WORKLOAD_COMPLIANCE", severity: "warning",
            message: `${name} has ${total} lessons this week, above the ${config.maxLessonsPerTeacherPerWeek} lesson weekly guideline.`,
            teacherId: tid, teacherName: name,
            action: `Review ${name}'s timetable and redistribute some lessons to a co-teacher.`,
          });
        }
      }
    }
    passes.push({ name: "WORKLOAD_COMPLIANCE", label: "Teacher workloads within limits", passed: issues.filter(i => i.severity === "error").length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 6: Subject spread ───────────────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const spreadMap = new Map<string, Set<number>>(); // "classId-subjectId" → days

    for (const s of slots) {
      const k = `${s.classId}-${s.subjectId}`;
      if (!spreadMap.has(k)) spreadMap.set(k, new Set());
      spreadMap.get(k)!.add(s.dayOfWeek);
    }

    for (const req of requirements) {
      if (req.minSpreadDays <= 1) continue;
      const k     = `${req.classId}-${req.subjectId}`;
      const days  = spreadMap.get(k)?.size ?? 0;
      if (days < req.minSpreadDays && days > 0) {
        issues.push({
          pass: "SUBJECT_SPREAD", severity: "warning",
          message: `${req.className} ${req.subjectCode} is spread across only ${days} day(s), but at least ${req.minSpreadDays} are recommended.`,
          classId: req.classId, className: req.className, subjectCode: req.subjectCode,
          action: `Run the optimizer to improve lesson distribution, or manually move a ${req.subjectCode} lesson for ${req.className} to a different day.`,
        });
      }
    }
    passes.push({ name: "SUBJECT_SPREAD", label: "Subject lessons spread across days", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 7: Teacher availability ────────────────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    for (const s of slots) {
      const unav = unavMap.get(s.teacherId);
      if (unav?.has(`${s.dayOfWeek}-${s.period}`)) {
        issues.push({
          pass: "TEACHER_AVAILABILITY", severity: "error",
          message: `${s.teacherName} is marked unavailable on day ${s.dayOfWeek} period ${s.period}, but is scheduled to teach ${s.className} ${s.subjectCode}.`,
          teacherId: s.teacherId, teacherName: s.teacherName, classId: s.classId, className: s.className,
          subjectCode: s.subjectCode, dayOfWeek: s.dayOfWeek, period: s.period,
          action: `Reassign ${s.subjectCode} for ${s.className} on day ${s.dayOfWeek} period ${s.period} to a different teacher or slot.`,
        });
      }
    }
    passes.push({ name: "TEACHER_AVAILABILITY", label: "No lessons during teacher unavailability", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Pass 8: Policy integrity (operating days) ────────────────────────────
  {
    const issues: ValidationIssue[] = [];
    const activeSet = new Set(config.operatingDays);
    for (const s of slots) {
      if (!activeSet.has(s.dayOfWeek)) {
        issues.push({
          pass: "POLICY_INTEGRITY", severity: "error",
          message: `${s.className} has ${s.subjectCode} scheduled on day ${s.dayOfWeek}, which is not an active operating day.`,
          classId: s.classId, className: s.className, subjectCode: s.subjectCode, dayOfWeek: s.dayOfWeek,
          action: `Remove all lessons on day ${s.dayOfWeek} or re-enable that day in Settings → Operating Days.`,
        });
      }
    }
    passes.push({ name: "POLICY_INTEGRITY", label: "All lessons on active operating days", passed: issues.length === 0, issueCount: issues.length, issues });
  }

  // ── Compile report ──────────────────────────────────────────────────────
  const allIssues = passes.flatMap((p) => p.issues);
  const errorCount   = allIssues.filter((i) => i.severity === "error").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;

  return {
    overallPassed: errorCount === 0,
    errorCount,
    warningCount,
    passes,
    errors: allIssues.filter((i) => i.severity === "error"),
  };
}
