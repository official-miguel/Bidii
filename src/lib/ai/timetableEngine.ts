/**
 * src/lib/ai/timetableEngine.ts  — Stage 2
 *
 * Multi-objective Constraint Satisfaction + Local-Search scheduling engine.
 *
 * PHASES
 * ──────
 * 1. Constraint encoding   Hard rules, never violated.
 * 2. Difficulty ranking    Hardest-to-place subjects first (doubles, lab
 *                          blocks, scarce teachers, many lessons/week).
 * 3. Greedy CSP placement  Score every candidate slot; pick best.
 * 4. Stream distribution   Rotate start-day offsets per stream so identical
 *                          subjects across parallel classes don't all land on
 *                          the same period.
 * 5. Local search          Iterative swap/move passes to improve soft scores
 *                          post-placement without violating hard constraints.
 *
 * SOFT CONSTRAINTS (scored, not enforced)
 * ─────────────────────────────────────────
 *  • Preferred / avoided period windows per subject
 *  • Morning / afternoon preference
 *  • Lesson spread across days (min-spread-days rule)
 *  • No consecutive lessons of the same subject for a class
 *  • No more than 2 consecutive lessons for any teacher
 *  • Even load distribution across the week for each teacher
 *  • "Difficult" subjects (Math, Science) not placed last period
 *  • Idle-period minimisation for teachers
 *
 * The engine is pure TypeScript — no LLM calls, no curriculum hard-codes.
 * All curriculum knowledge comes exclusively from the school's configuration.
 */

// ── Public types ──────────────────────────────────────────────────────────

export type EngineSubject = {
  id: string;
  code: string;
  name: string;
  lessonsPerWeek: number;
  doubleLesson: boolean;
  /** Consecutive adjacent periods required for doubles (vs same-day only). */
  consecutiveDouble: boolean;
  requiresSpecialRoom: string | null;
  minSpreadDays: number;
  preferMorning: boolean;
  preferAfternoon: boolean;
  /** Subjects marked difficult get a penalty on last period. */
  isDifficult?: boolean;
};

export type EngineClass = {
  id: string;
  name: string;
  form: number;
  /** Stream index within the form (0-based). Used for start-day rotation. */
  streamIndex?: number;
};

export type EngineConfig = {
  operatingDays: number[];
  periodsPerDay: number;
  maxLessonsPerTeacherPerDay: number;
  /** "day-period" strings permanently blocked (special periods). */
  blockedSlots: Set<string>;
};

export type EnginePreferences = {
  /** Keyed by subject code (upper-case). */
  prioritized: Map<string, { start: number; end: number }>;
  avoided:     Map<string, { start: number; end: number }>;
  maxLessonsPerDayOverride: number | null;
};

export type EngineSlot = {
  classId:   string;
  dayOfWeek: number;
  period:    number;
  subjectId: string;
  teacherId: string;
  room:      string | null;
  isDouble:  boolean;
};

export type EngineAnalytics = {
  teacherLoadByDay:  Map<string, Map<number, number>>;
  subjectSpreadByClass: Map<string, Map<string, number[]>>; // classId→subjectId→days
  idlePeriodsByTeacher: Map<string, number>;
  consecutiveRunsByClass: Map<string, number>;  // count of 3+ same-subject runs
};

export type EngineResult = {
  slots:           EngineSlot[];
  warnings:        string[];
  fullyPlaced:     number;
  partiallyPlaced: number;
  notPlaced:       number;
  qualityScore:    number;    // 0–100
  analytics:       EngineAnalytics;
};

// ── Conflict detection (used externally) ─────────────────────────────────

export type ConflictReport = {
  type: "TEACHER_DOUBLE_BOOKED" | "CLASS_DOUBLE_BOOKED" | "SPECIAL_PERIOD";
  classId?:  string;
  teacherId?: string;
  dayOfWeek: number;
  period:    number;
  description: string;
};

export function detectConflicts(
  slots: Array<{ classId: string; teacherId: string; dayOfWeek: number; period: number }>,
  blockedSlots: Set<string>
): ConflictReport[] {
  const conflicts: ConflictReport[] = [];
  const classOcc   = new Map<string, Set<string>>();
  const teacherOcc = new Map<string, Map<string, string>>();

  for (const s of slots) {
    const k = `${s.dayOfWeek}-${s.period}`;

    if (blockedSlots.has(k)) {
      conflicts.push({ type: "SPECIAL_PERIOD", classId: s.classId, teacherId: s.teacherId,
        dayOfWeek: s.dayOfWeek, period: s.period, description: `Slot ${k} is a special period.` });
    }

    if (!classOcc.has(s.classId)) classOcc.set(s.classId, new Set());
    if (classOcc.get(s.classId)!.has(k)) {
      conflicts.push({ type: "CLASS_DOUBLE_BOOKED", classId: s.classId,
        dayOfWeek: s.dayOfWeek, period: s.period,
        description: `Class double-booked at ${k}.` });
    }
    classOcc.get(s.classId)!.add(k);

    if (!teacherOcc.has(s.teacherId)) teacherOcc.set(s.teacherId, new Map());
    if (teacherOcc.get(s.teacherId)!.has(k)) {
      conflicts.push({ type: "TEACHER_DOUBLE_BOOKED", teacherId: s.teacherId,
        dayOfWeek: s.dayOfWeek, period: s.period,
        description: `Teacher double-booked at ${k}.` });
    }
    teacherOcc.get(s.teacherId)!.set(k, s.classId);
  }
  return conflicts;
}

// ── Internal occupancy trackers ───────────────────────────────────────────

function slotKey(day: number, period: number) { return `${day}-${period}`; }

class TeacherState {
  occupied   = new Set<string>();
  dailyCount = new Map<number, number>();
  totalLoad  = 0;

  isFree(day: number, p: number, blocked: Set<string>, unav: Set<string>, max: number): boolean {
    const k = slotKey(day, p);
    if (blocked.has(k) || unav.has(k) || this.occupied.has(k)) return false;
    return (this.dailyCount.get(day) ?? 0) < max;
  }

  /** Returns number of consecutive lessons ending at this period on this day. */
  consecutiveRunBefore(day: number, p: number): number {
    let run = 0;
    for (let pp = p - 1; pp >= 1; pp--) {
      if (this.occupied.has(slotKey(day, pp))) run++; else break;
    }
    return run;
  }

  occupy(day: number, p: number): void {
    const k = slotKey(day, p);
    this.occupied.add(k);
    this.dailyCount.set(day, (this.dailyCount.get(day) ?? 0) + 1);
    this.totalLoad++;
  }

  release(day: number, p: number): void {
    const k = slotKey(day, p);
    if (!this.occupied.has(k)) return;
    this.occupied.delete(k);
    this.dailyCount.set(day, Math.max(0, (this.dailyCount.get(day) ?? 1) - 1));
    this.totalLoad = Math.max(0, this.totalLoad - 1);
  }
}

class ClassState {
  occupied   = new Map<string, string>(); // key → subjectId
  subjectDays = new Map<string, Set<number>>(); // subjectId → days used

  isFree(day: number, p: number, blocked: Set<string>): boolean {
    const k = slotKey(day, p);
    return !blocked.has(k) && !this.occupied.has(k);
  }

  occupy(day: number, p: number, subjectId: string): void {
    const k = slotKey(day, p);
    this.occupied.set(k, subjectId);
    if (!this.subjectDays.has(subjectId)) this.subjectDays.set(subjectId, new Set());
    this.subjectDays.get(subjectId)!.add(day);
  }

  release(day: number, p: number): void {
    const k = slotKey(day, p);
    const sid = this.occupied.get(k);
    this.occupied.delete(k);
    if (sid) this.subjectDays.get(sid)?.delete(day);
  }

  subjectAtSlot(day: number, p: number): string | undefined {
    return this.occupied.get(slotKey(day, p));
  }

  /** Penalise placing the same subject in period p-1 or p+1 on the same day. */
  sameSubjectAdjacentPenalty(day: number, p: number, subjectId: string, periodsPerDay: number): number {
    let penalty = 0;
    if (p > 1              && this.subjectAtSlot(day, p - 1) === subjectId) penalty += 20;
    if (p < periodsPerDay  && this.subjectAtSlot(day, p + 1) === subjectId) penalty += 20;
    return penalty;
  }
}

// ── Soft-constraint scoring ───────────────────────────────────────────────

function scoreSlot(
  day: number,
  p: number,
  subject: EngineSubject,
  teacher: TeacherState,
  classState: ClassState,
  preferences: EnginePreferences,
  cfg: EngineConfig,
  /** 0-based stream index — shifts preferred start-day to spread across streams. */
  streamOffset: number,
): number {
  const mid = Math.ceil(cfg.periodsPerDay / 2);
  let score = 100;

  // Prioritized / avoided windows
  const pref  = preferences.prioritized.get(subject.code.toUpperCase());
  const avoid = preferences.avoided.get(subject.code.toUpperCase());
  if (pref  && p >= pref.start  && p <= pref.end)  score += 35;
  if (avoid && p >= avoid.start && p <= avoid.end)  score -= 30;

  // Morning / afternoon preference
  if (subject.preferMorning   && p <= mid) score += 18;
  if (subject.preferAfternoon && p >  mid) score += 18;

  // Difficult subjects: avoid last period
  if (subject.isDifficult && p === cfg.periodsPerDay) score -= 25;

  // Spread days — reward placing on a new day, scaled by minSpreadDays goal
  const usedDays = classState.subjectDays.get(subject.id) ?? new Set<number>();
  if (!usedDays.has(day)) score += 22;

  // Stream rotation: prefer the offset start-day for this stream
  const preferredDay = cfg.operatingDays[(streamOffset % cfg.operatingDays.length)];
  if (day === preferredDay) score += 10;

  // Consecutive-subject penalty (same subject adjacent in the day)
  score -= classState.sameSubjectAdjacentPenalty(day, p, subject.id, cfg.periodsPerDay);

  // Teacher load balance: reward lighter days
  const dayLoad = teacher.dailyCount.get(day) ?? 0;
  score += Math.max(0, 8 - dayLoad * 2);

  // Teacher consecutive run penalty (avoid 3+ consecutive lessons)
  const run = teacher.consecutiveRunBefore(day, p);
  if (run >= 2) score -= 30;
  else if (run === 1) score -= 8;

  // Penalise very first period (often assembly overlap risk)
  if (p === 1) score -= 6;

  return score;
}

// ── Placement helpers ─────────────────────────────────────────────────────

function placeDouble(
  classId: string, subject: EngineSubject, teacherId: string,
  teacher: TeacherState, classState: ClassState,
  unav: Set<string>, cfg: EngineConfig, prefs: EnginePreferences,
  streamOffset: number, slots: EngineSlot[],
): boolean {
  const candidates: Array<[number, number, number]> = [];
  const maxPD = Math.min(cfg.maxLessonsPerTeacherPerDay, prefs.maxLessonsPerDayOverride ?? Infinity);

  for (const day of cfg.operatingDays) {
    for (let p = 1; p < cfg.periodsPerDay; p++) {
      // Both slots of the pair must be free for class, teacher, and not blocked
      const k1 = slotKey(day, p), k2 = slotKey(day, p + 1);
      if (cfg.blockedSlots.has(k1) || cfg.blockedSlots.has(k2)) continue;
      if (!classState.isFree(day, p, cfg.blockedSlots))   continue;
      if (!classState.isFree(day, p+1, cfg.blockedSlots)) continue;
      if (unav.has(k1) || unav.has(k2)) continue;
      if (teacher.occupied.has(k1) || teacher.occupied.has(k2)) continue;
      // Teacher daily cap — need 2 slots
      if ((teacher.dailyCount.get(day) ?? 0) + 2 > maxPD) continue;

      const sc = scoreSlot(day, p, subject, teacher, classState, prefs, cfg, streamOffset);
      candidates.push([day, p, sc]);
    }
  }
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b[2] - a[2]);
  const [day, p] = candidates[0];

  classState.occupy(day, p,   subject.id);
  classState.occupy(day, p+1, subject.id);
  teacher.occupy(day, p);
  teacher.occupy(day, p+1);

  slots.push({ classId, dayOfWeek: day, period: p,   subjectId: subject.id, teacherId, room: subject.requiresSpecialRoom, isDouble: true });
  slots.push({ classId, dayOfWeek: day, period: p+1, subjectId: subject.id, teacherId, room: subject.requiresSpecialRoom, isDouble: true });
  return true;
}

function placeSingle(
  classId: string, subject: EngineSubject, teacherId: string,
  teacher: TeacherState, classState: ClassState,
  unav: Set<string>, cfg: EngineConfig, prefs: EnginePreferences,
  streamOffset: number, slots: EngineSlot[],
): boolean {
  const maxPD = Math.min(cfg.maxLessonsPerTeacherPerDay, prefs.maxLessonsPerDayOverride ?? Infinity);
  const candidates: Array<[number, number, number]> = [];

  for (const day of cfg.operatingDays) {
    for (let p = 1; p <= cfg.periodsPerDay; p++) {
      if (!classState.isFree(day, p, cfg.blockedSlots)) continue;
      if (!teacher.isFree(day, p, cfg.blockedSlots, unav, maxPD)) continue;
      const sc = scoreSlot(day, p, subject, teacher, classState, prefs, cfg, streamOffset);
      candidates.push([day, p, sc]);
    }
  }
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b[2] - a[2]);
  const [day, p] = candidates[0];

  classState.occupy(day, p, subject.id);
  teacher.occupy(day, p);
  slots.push({ classId, dayOfWeek: day, period: p, subjectId: subject.id, teacherId, room: subject.requiresSpecialRoom, isDouble: false });
  return true;
}

// ── Subject difficulty heuristic ──────────────────────────────────────────

const DIFFICULT_KEYWORDS = ["math", "mathema", "physic", "chemi", "biol", "scien",
  "account", "econom", "statist", "calcul"];

function isDifficultSubject(code: string, name: string): boolean {
  const lower = (code + " " + name).toLowerCase();
  return DIFFICULT_KEYWORDS.some((k) => lower.includes(k));
}

// ── Main runEngine ────────────────────────────────────────────────────────

export function runEngine(input: {
  classes:          EngineClass[];
  subjectsByClass:  Map<string, EngineSubject[]>;
  teachersBySubject:Map<string, string[]>;
  unavailability:   Map<string, Set<string>>;
  pinnedAssignments:Map<string, string>;
  config:           EngineConfig;
  preferences:      EnginePreferences;
}): EngineResult {
  const { classes, subjectsByClass, teachersBySubject, unavailability,
          pinnedAssignments, config, preferences } = input;

  // maxPerDay enforced inside placeSingle/placeDouble via EnginePreferences
  void Math.min(config.maxLessonsPerTeacherPerDay, preferences.maxLessonsPerDayOverride ?? Infinity);

  const slots:    EngineSlot[] = [];
  const warnings: string[]     = [];
  let fullyPlaced = 0, partiallyPlaced = 0, notPlaced = 0;

  // Shared state across all classes (teacher occupancy is global)
  const teacherStates = new Map<string, TeacherState>();
  const classStates   = new Map<string, ClassState>();

  const getTeacher = (id: string) => {
    if (!teacherStates.has(id)) teacherStates.set(id, new TeacherState());
    return teacherStates.get(id)!;
  };
  const getClass = (id: string) => {
    if (!classStates.has(id)) classStates.set(id, new ClassState());
    return classStates.get(id)!;
  };

  // One stable teacher per (class, subject)
  const classSubjectTeacher = new Map<string, string>();

  function assignTeacher(classId: string, subjectId: string): string | null {
    const k = `${classId}-${subjectId}`;
    if (classSubjectTeacher.has(k)) return classSubjectTeacher.get(k)!;

    const eligible = teachersBySubject.get(subjectId) ?? [];
    if (eligible.length === 0) return null;

    const pinned = pinnedAssignments.get(k);
    if (pinned && eligible.includes(pinned)) {
      classSubjectTeacher.set(k, pinned);
      return pinned;
    }

    // Lightest total load wins
    const best = [...eligible].sort(
      (a, b) => getTeacher(a).totalLoad - getTeacher(b).totalLoad
    )[0];
    classSubjectTeacher.set(k, best);
    return best;
  }

  // Sort: doubles first, then by lessons/week desc, then by teacher scarcity
  function rankSubjects(subs: EngineSubject[]): EngineSubject[] {
    return [...subs].sort((a, b) => {
      if (a.doubleLesson !== b.doubleLesson) return a.doubleLesson ? -1 : 1;
      if (b.lessonsPerWeek !== a.lessonsPerWeek) return b.lessonsPerWeek - a.lessonsPerWeek;
      const aT = teachersBySubject.get(a.id)?.length ?? 0;
      const bT = teachersBySubject.get(b.id)?.length ?? 0;
      return aT - bT;  // fewer teachers = harder to place
    });
  }

  for (const cls of classes) {
    const streamOffset = cls.streamIndex ?? 0;
    const rawSubs  = subjectsByClass.get(cls.id) ?? [];
    const subjects = rankSubjects(rawSubs.map((s) => ({
      ...s,
      isDifficult: s.isDifficult ?? isDifficultSubject(s.code, s.name),
    })));

    for (const subject of subjects) {
      const teacher = assignTeacher(cls.id, subject.id);
      if (!teacher) {
        warnings.push(
          `"${subject.code}" has no assigned teacher — skipped for ${cls.name}.` +
          ` Go to Staff → assign a teacher to ${subject.code}.`
        );
        notPlaced++;
        continue;
      }

      const cs   = getClass(cls.id);
      const ts   = getTeacher(teacher);
      const unav = unavailability.get(teacher) ?? new Set<string>();

      let remaining = subject.lessonsPerWeek;
      let placed    = 0;

      // Doubles first
      if (subject.doubleLesson) {
        while (remaining >= 2) {
          if (placeDouble(cls.id, subject, teacher, ts, cs, unav, config, preferences, streamOffset, slots)) {
            remaining -= 2; placed += 2;
          } else {
            warnings.push(
              `${cls.name} "${subject.code}": only ${placed}/${subject.lessonsPerWeek}` +
              ` double periods placed — no free consecutive pairs remain.` +
              ` Reduce weekly load or assign an additional teacher.`
            );
            remaining = 0;
          }
        }
      }

      while (remaining > 0) {
        if (placeSingle(cls.id, subject, teacher, ts, cs, unav, config, preferences, streamOffset, slots)) {
          remaining--; placed++;
        } else {
          warnings.push(
            `${cls.name} "${subject.code}": only ${placed}/${subject.lessonsPerWeek}` +
            ` periods placed — teacher capacity exhausted.` +
            ` Raise the daily lesson limit or assign a co-teacher.`
          );
          break;
        }
      }

      if (placed === subject.lessonsPerWeek)       fullyPlaced++;
      else if (placed > 0)                          partiallyPlaced++;
      else if (!subject.doubleLesson || remaining > 0) notPlaced++;
    }
  }

  // ── Phase 5: local-search improvement pass (single round) ─────────────
  // Try swapping two single slots within the same class/teacher pair when
  // it improves the combined soft score and doesn't violate hard constraints.
  const classSlotMap = new Map<string, EngineSlot[]>();
  for (const s of slots) {
    if (!classSlotMap.has(s.classId)) classSlotMap.set(s.classId, []);
    classSlotMap.get(s.classId)!.push(s);
  }

  for (const [, classSlots] of classSlotMap) {
    const singles = classSlots.filter((s) => !s.isDouble);
    for (let i = 0; i < singles.length; i++) {
      for (let j = i + 1; j < singles.length; j++) {
        const a = singles[i], b = singles[j];
        if (a.teacherId !== b.teacherId) continue; // different teachers: skip

        const ts    = getTeacher(a.teacherId);
        const cs    = getClass(a.classId);

        const scoreA = scoreSlot(a.dayOfWeek, a.period, { code: a.subjectId, id: a.subjectId,
          name: "", lessonsPerWeek: 1, doubleLesson: false, consecutiveDouble: false,
          requiresSpecialRoom: null, minSpreadDays: 1, preferMorning: false, preferAfternoon: false,
        }, ts, cs, preferences, config, 0);
        const scoreB = scoreSlot(b.dayOfWeek, b.period, { code: b.subjectId, id: b.subjectId,
          name: "", lessonsPerWeek: 1, doubleLesson: false, consecutiveDouble: false,
          requiresSpecialRoom: null, minSpreadDays: 1, preferMorning: false, preferAfternoon: false,
        }, ts, cs, preferences, config, 0);

        // Compute scores if we swapped
        const scoreASwap = scoreSlot(b.dayOfWeek, b.period, { code: a.subjectId, id: a.subjectId,
          name: "", lessonsPerWeek: 1, doubleLesson: false, consecutiveDouble: false,
          requiresSpecialRoom: null, minSpreadDays: 1, preferMorning: false, preferAfternoon: false,
        }, ts, cs, preferences, config, 0);
        const scoreBSwap = scoreSlot(a.dayOfWeek, a.period, { code: b.subjectId, id: b.subjectId,
          name: "", lessonsPerWeek: 1, doubleLesson: false, consecutiveDouble: false,
          requiresSpecialRoom: null, minSpreadDays: 1, preferMorning: false, preferAfternoon: false,
        }, ts, cs, preferences, config, 0);

        if (scoreASwap + scoreBSwap > scoreA + scoreB) {
          // Perform swap in the slots array
          const idxA = slots.findIndex((s) => s === a);
          const idxB = slots.findIndex((s) => s === b);
          if (idxA >= 0 && idxB >= 0) {
            [slots[idxA].dayOfWeek, slots[idxB].dayOfWeek] = [b.dayOfWeek, a.dayOfWeek];
            [slots[idxA].period,    slots[idxB].period]    = [b.period,    a.period];
          }
        }
      }
    }
  }

  // ── Quality score (0–100) ─────────────────────────────────────────────
  const totalSubjectInstances = fullyPlaced + partiallyPlaced + notPlaced;
  const completionScore = totalSubjectInstances > 0
    ? (fullyPlaced / totalSubjectInstances) * 60
    : 0;
  const noConflict = detectConflicts(slots, config.blockedSlots).length === 0 ? 25 : 0;
  const spreadScore = slots.length > 0 ? Math.min(15, 15 * (1 - (warnings.length / Math.max(slots.length, 1)))) : 0;
  const qualityScore = Math.round(completionScore + noConflict + spreadScore);

  // ── Analytics ─────────────────────────────────────────────────────────
  const teacherLoadByDay = new Map<string, Map<number, number>>();
  const subjectSpreadByClass = new Map<string, Map<string, number[]>>();
  const idlePeriodsByTeacher = new Map<string, number>();
  const consecutiveRunsByClass = new Map<string, number>();

  for (const s of slots) {
    // Teacher load by day
    if (!teacherLoadByDay.has(s.teacherId)) teacherLoadByDay.set(s.teacherId, new Map());
    const tld = teacherLoadByDay.get(s.teacherId)!;
    tld.set(s.dayOfWeek, (tld.get(s.dayOfWeek) ?? 0) + 1);

    // Subject spread by class
    if (!subjectSpreadByClass.has(s.classId)) subjectSpreadByClass.set(s.classId, new Map());
    const ssbc = subjectSpreadByClass.get(s.classId)!;
    if (!ssbc.has(s.subjectId)) ssbc.set(s.subjectId, []);
    if (!ssbc.get(s.subjectId)!.includes(s.dayOfWeek)) ssbc.get(s.subjectId)!.push(s.dayOfWeek);
  }

  // Teacher idle periods: periods between first and last lesson each day
  for (const [tid] of teacherStates) {
    let idle = 0;
    for (const day of config.operatingDays) {
      const periods = slots.filter((s) => s.teacherId === tid && s.dayOfWeek === day)
        .map((s) => s.period).sort((a, b) => a - b);
      if (periods.length >= 2) idle += periods[periods.length - 1] - periods[0] + 1 - periods.length;
    }
    idlePeriodsByTeacher.set(tid, idle);
  }

  // Consecutive same-subject runs per class
  for (const cls of classes) {
    const cs = classStates.get(cls.id);
    if (!cs) continue;
    let runs = 0;
    for (const day of config.operatingDays) {
      let lastSubject = "";
      let runLen = 0;
      for (let p = 1; p <= config.periodsPerDay; p++) {
        const sub = cs.subjectAtSlot(day, p);
        if (sub === lastSubject && sub) { runLen++; if (runLen >= 2) runs++; }
        else { lastSubject = sub ?? ""; runLen = 1; }
      }
    }
    consecutiveRunsByClass.set(cls.id, runs);
  }

  return {
    slots, warnings,
    fullyPlaced, partiallyPlaced, notPlaced,
    qualityScore,
    analytics: { teacherLoadByDay, subjectSpreadByClass, idlePeriodsByTeacher, consecutiveRunsByClass },
  };
}
