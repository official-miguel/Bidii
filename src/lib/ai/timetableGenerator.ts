/// The deterministic core of the AI Timetable Generator. Gemini (via
/// constraintParser.ts) turns the Principal's chat instructions into the
/// `preferences` this function reads, but the scheduling guarantees —
/// no double-booked teacher, no double-booked class, nobody scheduled
/// when unavailable, nobody over their daily lesson cap — come entirely
/// from this plain TypeScript, not from the AI. That split is deliberate:
/// an LLM asked to emit a full weekly grid directly will occasionally
/// hallucinate a clash; a constraint solver never does. This keeps the
/// "prevent conflicts before saving" requirement true regardless of
/// anything Gemini does.

export type GenSubject = {
  id: string;
  code: string;
  name: string;
  lessonsPerWeek: number;
  doubleLesson: boolean;
  requiresSpecialRoom: string | null;
};

export type GenClass = { id: string; name: string; form: number };

export type GenConfig = {
  periodsPerDay: number;
  gamesDayOfWeek: number | null;
  gamesPeriod: number | null;
  maxLessonsPerTeacherPerDay: number;
};

export type GenPreferences = {
  /// Keyed by subject code. Period ranges are inclusive, 1-based.
  prioritized: Map<string, { start: number; end: number }>;
  avoided: Map<string, { start: number; end: number }>;
  maxLessonsPerDayOverride: number | null;
};

export type GenSlot = {
  classId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  teacherId: string;
  room: string | null;
};

export type GenerationResult = {
  slots: GenSlot[];
  warnings: string[];
};

const DAYS = [0, 1, 2, 3, 4];

export function generateTimetable(input: {
  classes: GenClass[];
  /// Subjects a class should be taught, keyed by form number.
  subjectsByForm: Map<number, GenSubject[]>;
  /// Teachers eligible to teach each subject (Section 2B.1 assignments),
  /// keyed by subjectId.
  teachersBySubject: Map<string, string[]>;
  /// Slots each teacher can't be scheduled in, keyed by teacherId, values
  /// as "day-period" strings.
  unavailability: Map<string, Set<string>>;
  /// Standing "who teaches this class this subject" assignments
  /// (ClassSubjectTeacher), keyed by "classId-subjectId". When set, the
  /// generator always reuses this teacher rather than picking one by
  /// lightest load — this is what makes a teacher "continue to be the
  /// teacher of that subject to that class until changed" hold true across
  /// regenerations, not just within a single run.
  pinnedAssignments?: Map<string, string>;
  config: GenConfig;
  preferences: GenPreferences;
}): GenerationResult {
  const { classes, subjectsByForm, teachersBySubject, unavailability, config, preferences } = input;
  const pinnedAssignments = input.pinnedAssignments ?? new Map<string, string>();
  const periods = Array.from({ length: config.periodsPerDay }, (_, i) => i + 1);
  const maxPerDay = Math.min(
    config.maxLessonsPerTeacherPerDay,
    preferences.maxLessonsPerDayOverride ?? Infinity
  );

  const slots: GenSlot[] = [];
  const warnings: string[] = [];

  const blocked = new Set<string>();
  if (config.gamesDayOfWeek != null && config.gamesPeriod != null) {
    blocked.add(`${config.gamesDayOfWeek}-${config.gamesPeriod}`);
  }

  const classOccupied = new Map<string, Set<string>>();
  const teacherOccupied = new Map<string, Set<string>>();
  const teacherDailyCount = new Map<string, Map<number, number>>();
  const teacherTotalLoad = new Map<string, number>();

  const isClassFree = (classId: string, day: number, period: number) => {
    const key = `${day}-${period}`;
    if (blocked.has(key)) return false;
    return !classOccupied.get(classId)?.has(key);
  };

  const isTeacherFree = (teacherId: string, day: number, period: number) => {
    const key = `${day}-${period}`;
    if (blocked.has(key)) return false;
    if (unavailability.get(teacherId)?.has(key)) return false;
    if (teacherOccupied.get(teacherId)?.has(key)) return false;
    const dayCount = teacherDailyCount.get(teacherId)?.get(day) ?? 0;
    return dayCount < maxPerDay;
  };

  const occupy = (classId: string, teacherId: string, day: number, period: number) => {
    const key = `${day}-${period}`;
    if (!classOccupied.has(classId)) classOccupied.set(classId, new Set());
    classOccupied.get(classId)!.add(key);
    if (!teacherOccupied.has(teacherId)) teacherOccupied.set(teacherId, new Set());
    teacherOccupied.get(teacherId)!.add(key);
    if (!teacherDailyCount.has(teacherId)) teacherDailyCount.set(teacherId, new Map());
    const dayMap = teacherDailyCount.get(teacherId)!;
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    teacherTotalLoad.set(teacherId, (teacherTotalLoad.get(teacherId) ?? 0) + 1);
  };

  // One teacher per (class, subject) — decided once, then reused for every
  // lesson of that subject for that class all week. Without this, the old
  // per-slot "whoever's free right now" logic could hand Monday's Maths to
  // one teacher and Wednesday's Maths (same class) to a different one
  // whenever more than one teacher was assigned to the subject — accurate
  // to nobody's actual school. Real classes have one subject teacher.
  const classSubjectTeacher = new Map<string, string>();

  // Picks (and remembers) the teacher for this class+subject. A standing
  // ClassSubjectTeacher assignment wins whenever one exists and the teacher
  // is still eligible — that's the "same teacher every time" guarantee.
  // Only when there's no standing assignment (first-ever generation for
  // this pair, or the previously pinned teacher no longer teaches the
  // subject) does it fall back to picking the eligible teacher with the
  // lightest total load so far. Deliberately independent of any single
  // day/period's availability — the choice is "who teaches this class this
  // subject", not "who's free right now" — so it can't waver mid-week.
  const assignTeacher = (classId: string, subjectId: string): string | null => {
    const key = `${classId}-${subjectId}`;
    const existing = classSubjectTeacher.get(key);
    if (existing) return existing;

    const eligible = teachersBySubject.get(subjectId) ?? [];
    if (eligible.length === 0) return null;

    const pinned = pinnedAssignments.get(key);
    if (pinned && eligible.includes(pinned)) {
      classSubjectTeacher.set(key, pinned);
      return pinned;
    }

    const sorted = [...eligible].sort(
      (a, b) => (teacherTotalLoad.get(a) ?? 0) - (teacherTotalLoad.get(b) ?? 0)
    );
    const teacher = sorted[0];
    classSubjectTeacher.set(key, teacher);
    return teacher;
  };

  // Memoised period ordering per subject code.
  // orderedPeriodsForDay() result is fully determined by (subjectCode, periods, preferences)
  // — none of which change during generation — so computing it once and reusing
  // the cached array eliminates repeated sort+filter on every slot-placement attempt.
  const orderedPeriodsCache = new Map<string, number[]>();

  const orderedPeriodsForDay = (subjectCode: string): number[] => {
    const cached = orderedPeriodsCache.get(subjectCode);
    if (cached) return cached;

    const pref  = preferences.prioritized.get(subjectCode);
    const avoid = preferences.avoided.get(subjectCode);
    let ordered = [...periods];
    if (pref) {
      ordered.sort((a, b) => {
        const aIn = a >= pref.start && a <= pref.end ? 0 : 1;
        const bIn = b >= pref.start && b <= pref.end ? 0 : 1;
        return aIn - bIn;
      });
    }
    if (avoid) {
      const inRange = (p: number) => p >= avoid.start && p <= avoid.end;
      ordered = [...ordered.filter((p) => !inRange(p)), ...ordered.filter((p) => inRange(p))];
    }

    orderedPeriodsCache.set(subjectCode, ordered);
    return ordered;
  };

  for (const cls of classes) {
    const subjects = subjectsByForm.get(cls.form) ?? [];
    // Harder-to-place subjects (more periods/week) go first, so easy ones
    // fill remaining gaps rather than the other way round.
    const ordered = [...subjects].sort((a, b) => b.lessonsPerWeek - a.lessonsPerWeek);

    for (const subject of ordered) {
      const key = `${cls.id}-${subject.id}`;
      const pinned = pinnedAssignments.get(key);
      const eligible = teachersBySubject.get(subject.id) ?? [];
      const teacher = assignTeacher(cls.id, subject.id);
      if (!teacher) {
        warnings.push(`No teacher is assigned to ${subject.code} — skipped for ${cls.name}.`);
        continue;
      }
      if (pinned && pinned !== teacher && eligible.length > 0) {
        warnings.push(
          `${cls.name}'s usual ${subject.code} teacher is no longer assigned to that subject — a different teacher was picked for this generation. Update Subject Teachers if this isn't right.`
        );
      }

      let remaining = subject.lessonsPerWeek;
      const usedDays = new Set<number>();

      if (subject.doubleLesson) {
        while (remaining >= 2) {
          let placed = false;
          for (const day of DAYS) {
            if (usedDays.has(day)) continue;
            for (const p of orderedPeriodsForDay(subject.code)) {
              if (p === config.periodsPerDay) continue; // no p+1 to pair with
              if (!isClassFree(cls.id, day, p) || !isClassFree(cls.id, day, p + 1)) continue;
              if (!isTeacherFree(teacher, day, p) || !isTeacherFree(teacher, day, p + 1)) continue;

              occupy(cls.id, teacher, day, p);
              occupy(cls.id, teacher, day, p + 1);
              slots.push({ classId: cls.id, dayOfWeek: day, period: p, subjectId: subject.id, teacherId: teacher, room: subject.requiresSpecialRoom });
              slots.push({ classId: cls.id, dayOfWeek: day, period: p + 1, subjectId: subject.id, teacherId: teacher, room: subject.requiresSpecialRoom });
              usedDays.add(day);
              remaining -= 2;
              placed = true;
              break;
            }
            if (placed) break;
          }
          if (!placed) {
            warnings.push(
              `Could only place ${subject.lessonsPerWeek - remaining}/${subject.lessonsPerWeek} periods of ${subject.code} (double lessons) for ${cls.name} — their assigned teacher has no more free double slots this week. Assign a second teacher to ${subject.code} if this class needs more capacity.`
            );
            break;
          }
        }
      }

      while (remaining >= 1) {
        let placed = false;
        // Spread single lessons across different days before repeating a
        // day, unless there are more lessons/week than there are days.
        const dayOrder = [...DAYS].sort((a, b) => Number(usedDays.has(a)) - Number(usedDays.has(b)));
        for (const day of dayOrder) {
          for (const p of orderedPeriodsForDay(subject.code)) {
            if (!isClassFree(cls.id, day, p)) continue;
            if (!isTeacherFree(teacher, day, p)) continue;

            occupy(cls.id, teacher, day, p);
            slots.push({ classId: cls.id, dayOfWeek: day, period: p, subjectId: subject.id, teacherId: teacher, room: subject.requiresSpecialRoom });
            usedDays.add(day);
            remaining -= 1;
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (!placed) {
          warnings.push(
            `Could only schedule ${subject.lessonsPerWeek - remaining}/${subject.lessonsPerWeek} periods of ${subject.code} for ${cls.name} — their assigned teacher has no more free slots this week. Assign a second teacher to ${subject.code} if this class needs more capacity.`
          );
          break;
        }
      }
    }
  }

  return { slots, warnings };
}
