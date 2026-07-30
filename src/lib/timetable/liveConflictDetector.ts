/**
 * src/lib/timetable/liveConflictDetector.ts
 *
 * Client-side live conflict detection for the timetable builder UI.
 * Runs synchronously on every slot change with no network round-trip.
 */

export type ConflictType =
  | "TEACHER_DOUBLE_BOOKED"
  | "CLASS_DOUBLE_BOOKED"
  | "TEACHER_UNAVAILABLE"
  | "INACTIVE_DAY"
  | "WORKLOAD_EXCEEDED"
  | "LESSON_INCOMPLETE"
  | "DOUBLE_NOT_ADJACENT"
  | "EMPTY_SLOTS";

export type ConflictSeverity = "error" | "warning";

export type CellConflict = {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  action: string;
  relatedKeys: string[];
};

export type ConflictMap = Map<string, CellConflict[]>;

export type LiveSlot = {
  id: string;
  classId: string;
  className: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  subjectCode: string;
  teacherId: string;
  teacherName: string;
  room: string | null;
  isDouble: boolean;
  isManual: boolean;
  isLocked: boolean;
  lockScope?: string | null;
  lockReason?: string | null;
};

export type ConflictEngineConfig = {
  operatingDays: number[];
  periodsPerDay: number;
  blockedSlots: Set<string>;
  maxLessonsPerTeacherPerDay: number;
  teacherUnavailability: Map<string, Set<string>>;
  requiredLessons: Map<string, number>;
  doubleSubjects: Set<string>;
};

// ── Staff shortage types ───────────────────────────────────────────────────

export type StaffShortageLevel = "critical" | "high" | "moderate";

export type StaffShortageSuggestion = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  totalLessonsRequired: number;
  totalLessonsCapacity: number;  // what all assigned teachers can cover per week
  deficit: number;               // lessons that can't be staffed
  assignedTeachers: number;
  estimatedExtraTeachersNeeded: number;
  affectedClasses: string[];     // class names
  level: StaffShortageLevel;
  message: string;
  suggestion: string;
};

export type StaffShortageConfig = {
  /** Map of subjectId → array of teacherIds assigned to that subject school-wide */
  subjectTeacherMap: Map<string, string[]>;
  /** Map of subjectId → { code, name } */
  subjectMeta: Map<string, { code: string; name: string }>;
  /** Map of classId → className */
  classMeta: Map<string, string>;
  /** Max lessons a teacher can teach per week (operatingDays × maxPerDay) */
  maxLessonsPerTeacherPerWeek: number;
  /** Required lessons: Map of "classId-subjectId" → lessonsPerWeek */
  requiredLessons: Map<string, number>;
};

export type ConflictSummary = {
  totalErrors: number;
  totalWarnings: number;
  conflictMap: ConflictMap;
  conflictList: Array<{ key: string; conflict: CellConflict }>;
};

export function classKey(classId: string, day: number, period: number): string {
  return `class:${classId}|${day}-${period}`;
}

export function teacherKey(teacherId: string, day: number, period: number): string {
  return `teacher:${teacherId}|${day}-${period}`;
}

export function emptyClassKey(classId: string): string {
  return `class:${classId}|empty`;
}

export function detectLiveConflicts(
  slots: LiveSlot[],
  config: ConflictEngineConfig
): ConflictSummary {
  const map = new Map<string, CellConflict[]>();

  function add(key: string, conflict: CellConflict) {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(conflict);
  }

  // Pass 1: Teacher and class double-booking
  const teacherOcc = new Map<string, LiveSlot>();
  const classOcc = new Map<string, LiveSlot>();

  for (const s of slots) {
    const slotK = `${s.dayOfWeek}-${s.period}`;
    const tk = `${s.teacherId}|${slotK}`;
    const ck = `${s.classId}|${slotK}`;

    if (teacherOcc.has(tk)) {
      const other = teacherOcc.get(tk)!;
      const keyA = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const keyB = classKey(s.classId, s.dayOfWeek, s.period);
      const keyC = classKey(other.classId, s.dayOfWeek, s.period);
      const msg = `${s.teacherName} is double-booked — teaching ${other.className} and ${s.className} at period ${s.period}.`;
      const action = `Move one lesson to a different period or assign a different teacher.`;
      add(keyA, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyB, keyC] });
      add(keyB, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyC] });
      add(keyC, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyB] });
    } else {
      teacherOcc.set(tk, s);
    }

    if (classOcc.has(ck)) {
      const other = classOcc.get(ck)!;
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "CLASS_DOUBLE_BOOKED",
        severity: "error",
        message: `${s.className} has two subjects at period ${s.period} — ${other.subjectCode} and ${s.subjectCode}.`,
        action: `Remove one subject from this slot.`,
        relatedKeys: [],
      });
    } else {
      classOcc.set(ck, s);
    }
  }

  // Pass 2: Teacher unavailability
  for (const s of slots) {
    const slotK = `${s.dayOfWeek}-${s.period}`;
    if (config.teacherUnavailability.get(s.teacherId)?.has(slotK)) {
      const ck = classKey(s.classId, s.dayOfWeek, s.period);
      const tk = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const msg = `${s.teacherName} is unavailable at day ${s.dayOfWeek} period ${s.period}.`;
      const action = `Reassign to another teacher or update availability.`;
      add(ck, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [tk] });
      add(tk, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [ck] });
    }
  }

  // Pass 3: Inactive day
  const activeDays = new Set(config.operatingDays);
  for (const s of slots) {
    if (!activeDays.has(s.dayOfWeek)) {
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "INACTIVE_DAY",
        severity: "error",
        message: `Day ${s.dayOfWeek} is not an active operating day.`,
        action: `Move to an active operating day.`,
        relatedKeys: [],
      });
    }
  }

  // Pass 4: Teacher daily workload
  const teacherDayLoad = new Map<string, Map<number, LiveSlot[]>>();
  for (const s of slots) {
    if (!teacherDayLoad.has(s.teacherId)) teacherDayLoad.set(s.teacherId, new Map());
    const dm = teacherDayLoad.get(s.teacherId)!;
    if (!dm.has(s.dayOfWeek)) dm.set(s.dayOfWeek, []);
    dm.get(s.dayOfWeek)!.push(s);
  }
  for (const [, dayMap] of teacherDayLoad) {
    for (const [, daySlots] of dayMap) {
      if (daySlots.length > config.maxLessonsPerTeacherPerDay) {
        for (const ds of daySlots) {
          const key = teacherKey(ds.teacherId, ds.dayOfWeek, ds.period);
          add(key, {
            type: "WORKLOAD_EXCEEDED",
            severity: "error",
            message: `${ds.teacherName} has ${daySlots.length} lessons on day ${ds.dayOfWeek}, exceeding the ${config.maxLessonsPerTeacherPerDay}-lesson daily limit.`,
            action: `Move ${daySlots.length - config.maxLessonsPerTeacherPerDay} lesson(s) to other days.`,
            relatedKeys: daySlots
              .filter((x) => x !== ds)
              .map((x) => teacherKey(x.teacherId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // Pass 5: Lesson completion warnings
  const placed = new Map<string, number>();
  for (const s of slots) {
    const k = `${s.classId}-${s.subjectId}`;
    placed.set(k, (placed.get(k) ?? 0) + 1);
  }
  for (const [reqKey, required] of config.requiredLessons) {
    const count = placed.get(reqKey) ?? 0;
    if (count < required) {
      const [classId] = reqKey.split("-");
      const classSlots = slots.filter((s) => `${s.classId}-${s.subjectId}` === reqKey);
      const msg = `${classSlots[0]?.className ?? classId} only has ${count}/${required} ${classSlots[0]?.subjectCode ?? ""} lessons scheduled.`;
      for (const s of classSlots) {
        add(classKey(s.classId, s.dayOfWeek, s.period), {
          type: "LESSON_INCOMPLETE",
          severity: "warning",
          message: msg,
          action: `Add ${required - count} more lesson(s).`,
          relatedKeys: [],
        });
      }
    }
  }

  // Pass 6: Double-lesson adjacency
  const doubleGroups = new Map<string, LiveSlot[]>();
  for (const s of slots) {
    if (!config.doubleSubjects.has(`${s.classId}-${s.subjectId}`)) continue;
    const k = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
    if (!doubleGroups.has(k)) doubleGroups.set(k, []);
    doubleGroups.get(k)!.push(s);
  }
  for (const [, group] of doubleGroups) {
    const ps = group.map((s) => s.period).sort((a, b) => a - b);
    for (let i = 0; i < ps.length - 1; i += 2) {
      if (ps[i + 1] !== ps[i] + 1) {
        const s = group[0];
        const msg = `Double-lesson for ${s.subjectCode} in ${s.className} is not consecutive (periods ${ps[i]} and ${ps[i + 1]}).`;
        for (const gs of group) {
          add(classKey(gs.classId, gs.dayOfWeek, gs.period), {
            type: "DOUBLE_NOT_ADJACENT",
            severity: "error",
            message: msg,
            action: `Move one half to make the pair consecutive.`,
            relatedKeys: group
              .filter((x) => x !== gs)
              .map((x) => classKey(x.classId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // Pass 6b: Multiple double blocks on the same day for one subject
  // Group by class + subject + day to count double blocks per day
  const doubleDayGroups = new Map<string, LiveSlot[]>();
  for (const s of slots) {
    if (!config.doubleSubjects.has(`${s.classId}-${s.subjectId}`)) continue;
    const k = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
    if (!doubleDayGroups.has(k)) doubleDayGroups.set(k, []);
    doubleDayGroups.get(k)!.push(s);
  }
  for (const [, group] of doubleDayGroups) {
    // More than 2 slots on the same day means there are multiple double blocks
    if (group.length > 2) {
      const s = group[0];
      const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.dayOfWeek] ?? `Day ${s.dayOfWeek}`;
      const msg = `${s.subjectCode} in ${s.className} has ${group.length / 2 > 1 ? Math.floor(group.length / 2) : "multiple"} double blocks on ${dayName} — only one is allowed per day.`;
      for (const gs of group) {
        add(classKey(gs.classId, gs.dayOfWeek, gs.period), {
          type: "DOUBLE_NOT_ADJACENT",
          severity: "error",
          message: msg,
          action: `Move the extra double block to a different day.`,
          relatedKeys: group
            .filter((x) => x !== gs)
            .map((x) => classKey(x.classId, x.dayOfWeek, x.period)),
        });
      }
    }
  }

  // Pass 7: Empty slots — class has fewer total placed lessons than available weekly slots
  // This fires a class-level warning so users know slots will be left blank.
  const totalWeeklySlots = config.operatingDays.length * config.periodsPerDay;
  const classPlacedTotal = new Map<string, { count: number; name: string }>();
  for (const s of slots) {
    const entry = classPlacedTotal.get(s.classId) ?? { count: 0, name: s.className };
    entry.count += 1;
    classPlacedTotal.set(s.classId, entry);
  }
  // Also capture classes that appear in requiredLessons but have zero placed slots
  for (const reqKey of config.requiredLessons.keys()) {
    const [classId] = reqKey.split("-");
    if (!classPlacedTotal.has(classId)) {
      const sample = slots.find((s) => s.classId === classId);
      classPlacedTotal.set(classId, { count: 0, name: sample?.className ?? classId });
    }
  }
  for (const [classId, { count, name }] of classPlacedTotal) {
    const emptySlots = totalWeeklySlots - count;
    if (emptySlots > 0) {
      add(emptyClassKey(classId), {
        type: "EMPTY_SLOTS",
        severity: "warning",
        message: `${name} has ${emptySlots} slot${emptySlots !== 1 ? "s" : ""} per week with no lesson — ${count} of ${totalWeeklySlots} filled.`,
        action: "Add subjects/lessons to fill the remaining slots.",
        relatedKeys: [],
      });
    }
  }

  // Compile summary
  let totalErrors = 0;
  let totalWarnings = 0;
  const conflictList: Array<{ key: string; conflict: CellConflict }> = [];
  const seen = new Set<string>();

  for (const [key, conflicts] of map) {
    for (const c of conflicts) {
      if (c.severity === "error") totalErrors++;
      if (c.severity === "warning") totalWarnings++;
      const dedupKey = `${c.type}|${c.message}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        conflictList.push({ key, conflict: c });
      }
    }
  }

  return { totalErrors, totalWarnings, conflictMap: map, conflictList };
}

// ── Staff shortage analysis ────────────────────────────────────────────────

/**
 * Analyses teacher capacity vs lesson requirements for every subject and
 * returns a prioritised list of subjects that need additional staff.
 *
 * How it works:
 *   - For each subject, sum up all lessons required across all classes.
 *   - Compute total capacity: (number of assigned teachers) × maxLessonsPerTeacherPerWeek.
 *   - Any subject where required > capacity has a staffing deficit.
 *   - Severity is rated based on how far over capacity the subject is.
 */
export function analyseStaffShortages(
  config: StaffShortageConfig
): StaffShortageSuggestion[] {
  // Aggregate total lessons required per subject
  const subjectDemand = new Map<string, { total: number; classes: string[] }>();

  for (const [reqKey, lessons] of config.requiredLessons) {
    const [classId, subjectId] = reqKey.split("-");
    if (!subjectId) continue;
    const entry = subjectDemand.get(subjectId) ?? { total: 0, classes: [] };
    entry.total += lessons;
    const className = config.classMeta.get(classId) ?? classId;
    if (!entry.classes.includes(className)) entry.classes.push(className);
    subjectDemand.set(subjectId, entry);
  }

  const suggestions: StaffShortageSuggestion[] = [];

  for (const [subjectId, { total, classes }] of subjectDemand) {
    const teachers = config.subjectTeacherMap.get(subjectId) ?? [];
    const capacity = teachers.length * config.maxLessonsPerTeacherPerWeek;
    const deficit = total - capacity;

    if (deficit <= 0) continue; // fully staffed

    const meta = config.subjectMeta.get(subjectId);
    if (!meta) continue;

    // Each additional teacher can cover maxLessonsPerTeacherPerWeek lessons
    const extraNeeded = Math.ceil(deficit / config.maxLessonsPerTeacherPerWeek);

    const percentOver = capacity > 0 ? deficit / capacity : 1;
    const level: StaffShortageLevel =
      percentOver >= 0.5 || teachers.length === 0 ? "critical"
      : percentOver >= 0.25 ? "high"
      : "moderate";

    const teacherWord = extraNeeded === 1 ? "teacher" : "teachers";
    const classesLabel = classes.length <= 3
      ? classes.join(", ")
      : `${classes.slice(0, 3).join(", ")} +${classes.length - 3} more`;

    suggestions.push({
      subjectId,
      subjectCode: meta.code,
      subjectName: meta.name,
      totalLessonsRequired: total,
      totalLessonsCapacity: capacity,
      deficit,
      assignedTeachers: teachers.length,
      estimatedExtraTeachersNeeded: extraNeeded,
      affectedClasses: classes,
      level,
      message: teachers.length === 0
        ? `${meta.code} has no teacher assigned — ${total} lesson${total !== 1 ? "s" : ""}/week needed for ${classesLabel}.`
        : `${meta.code} is understaffed — ${teachers.length} teacher${teachers.length !== 1 ? "s" : ""} can cover ${capacity} of ${total} required lessons/week for ${classesLabel}.`,
      suggestion: `Add ${extraNeeded} more ${teacherWord} for ${meta.code} to cover the ${deficit}-lesson shortfall.`,
    });
  }

  // Sort: critical first, then by deficit size
  return suggestions.sort((a, b) => {
    const lvl = { critical: 0, high: 1, moderate: 2 };
    const diff = lvl[a.level] - lvl[b.level];
    return diff !== 0 ? diff : b.deficit - a.deficit;
  });
}
