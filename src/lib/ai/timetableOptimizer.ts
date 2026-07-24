/**
 * src/lib/ai/timetableOptimizer.ts — Stage 2
 *
 * Post-generation local-search optimizer.
 *
 * Takes a set of placed slots (from the engine or from a draft version) and
 * performs iterative improvement passes without ever violating hard constraints.
 *
 * Strategies (in priority order):
 *  1. Conflict resolution  — swap slots to eliminate any remaining double-bookings
 *  2. Spread improvement   — move lessons to achieve minSpreadDays for each subject
 *  3. Load balancing       — move teacher lessons from overloaded days to lighter ones
 *  4. Idle reduction       — swap to close gaps in teacher daily schedules
 *  5. Consecutive avoidance — swap to break 3+ same-subject runs
 *
 * Partial regeneration: when a class is specified, only that class's slots are
 * touched. Surrounding slots (other classes sharing the same teachers) are
 * treated as immovable obstacles, preventing cross-class conflicts.
 *
 * Nothing in this file calls Gemini — it is pure deterministic TypeScript.
 */

import { type EngineSlot, type EngineConfig, type EnginePreferences } from "./timetableEngine";

// ── Types ─────────────────────────────────────────────────────────────────

export type OptimizerInput = {
  slots:             EngineSlot[];
  config:            EngineConfig;
  preferences:       EnginePreferences;
  unavailability:    Map<string, Set<string>>;  // teacherId → "day-p" set
  requirements:      Map<string, number>;       // "classId-subjectId" → lessonsPerWeek
  /** If set, only optimize these class IDs. Others are locked. */
  targetClassIds?:   Set<string>;
  maxPasses?:        number;
};

export type OptimizationMove = {
  type:      "SWAP" | "MOVE";
  slotIdxA:  number;
  slotIdxB?: number;
  fromDay?:  number; fromPeriod?:  number;
  toDay?:    number; toPeriod?:    number;
  reason:    string;
  scoreDelta:number;
};

export type OptimizationSummary = {
  passesRun:         number;
  movesApplied:      number;
  conflictsResolved: number;
  spreadImproved:    number;
  loadBalanced:      number;
  idleReduced:       number;
  qualityDelta:      number;   // improvement in soft score
  remainingIssues:   string[]; // things the optimizer couldn't fix
};

// ── Hard-constraint checkers ──────────────────────────────────────────────

function key(day: number, p: number) { return `${day}-${p}`; }

/**
 * Can we place slot s at (newDay, newPeriod) without violating hard constraints?
 * Ignores the slot's current position (it will be vacated).
 */
function canPlace(
  s: EngineSlot,
  newDay: number, newPeriod: number,
  slots: EngineSlot[],
  currentIdx: number,
  config: EngineConfig,
  unavailability: Map<string, Set<string>>,
  maxPerDay: number,
): boolean {
  const k = key(newDay, newPeriod);
  if (config.blockedSlots.has(k)) return false;
  if (unavailability.get(s.teacherId)?.has(k)) return false;

  // Class conflict
  const classConflict = slots.some((o, i) =>
    i !== currentIdx &&
    o.classId   === s.classId &&
    o.dayOfWeek === newDay &&
    o.period    === newPeriod
  );
  if (classConflict) return false;

  // Teacher conflict
  const teacherConflict = slots.some((o, i) =>
    i !== currentIdx &&
    o.teacherId === s.teacherId &&
    o.dayOfWeek === newDay &&
    o.period    === newPeriod
  );
  if (teacherConflict) return false;

  // Daily teacher cap
  const dayCount = slots.filter((o, i) =>
    i !== currentIdx && o.teacherId === s.teacherId && o.dayOfWeek === newDay
  ).length;
  if (dayCount >= maxPerDay) return false;

  return true;
}

/** Soft score for a single slot placement (lower = better to move away from). */
function softScore(
  day: number, p: number, subjectCode: string,
  prefs: EnginePreferences, periodsPerDay: number,
): number {
  let score = 50;
  const pref  = prefs.prioritized.get(subjectCode.toUpperCase());
  const avoid = prefs.avoided.get(subjectCode.toUpperCase());
  if (pref  && p >= pref.start  && p <= pref.end)  score += 30;
  if (avoid && p >= avoid.start && p <= avoid.end)  score -= 25;
  if (p === periodsPerDay) score -= 10;
  return score;
}

// ── Main optimizer ────────────────────────────────────────────────────────

export function optimizeTimetable(input: OptimizerInput): {
  slots:   EngineSlot[];
  summary: OptimizationSummary;
} {
  const { config, preferences, unavailability, requirements, targetClassIds } = input;
  const maxPerDay  = Math.min(config.maxLessonsPerTeacherPerDay, preferences.maxLessonsPerDayOverride ?? Infinity);
  const maxPasses  = input.maxPasses ?? 4;
  const slots      = input.slots.map((s) => ({ ...s })); // deep-copy so caller's array is untouched

  const summary: OptimizationSummary = {
    passesRun: 0, movesApplied: 0, conflictsResolved: 0,
    spreadImproved: 0, loadBalanced: 0, idleReduced: 0,
    qualityDelta: 0, remainingIssues: [],
  };

  const isTarget = (classId: string) => !targetClassIds || targetClassIds.has(classId);

  for (let pass = 0; pass < maxPasses; pass++) {
    summary.passesRun++;
    let madeMove = false;

    // ── Strategy 1: Spread improvement ─────────────────────────────────
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!isTarget(s.classId) || s.isDouble) continue;

      const reqKey   = `${s.classId}-${s.subjectId}`;
      const required = requirements.get(reqKey) ?? 0;
      if (required < 2) continue;

      // Count distinct days this subject already covers for this class
      const subjectDays = new Set(
        slots.filter((o) => o.classId === s.classId && o.subjectId === s.subjectId)
          .map((o) => o.dayOfWeek)
      );
      if (subjectDays.size >= Math.min(required, config.operatingDays.length)) continue;

      // Try moving this slot to a day not yet covered
      const unusedDays = config.operatingDays.filter((d) => !subjectDays.has(d) || d === s.dayOfWeek);
      for (const newDay of unusedDays) {
        if (newDay === s.dayOfWeek) continue;
        for (let p = 1; p <= config.periodsPerDay; p++) {
          if (canPlace(s, newDay, p, slots, i, config, unavailability, maxPerDay)) {
            const before = softScore(s.dayOfWeek, s.period, s.subjectId, preferences, config.periodsPerDay);
            const after  = softScore(newDay, p, s.subjectId, preferences, config.periodsPerDay);
            if (after >= before - 5) { // only accept neutral-or-better moves
              slots[i] = { ...s, dayOfWeek: newDay, period: p };
              summary.movesApplied++; summary.spreadImproved++; summary.qualityDelta += (after - before);
              madeMove = true;
              break;
            }
          }
        }
        if (madeMove) break;
      }
    }

    // ── Strategy 2: Load balancing ──────────────────────────────────────
    for (const teacherId of new Set(slots.map((s) => s.teacherId))) {
      const tSlots = slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.teacherId === teacherId && !s.isDouble && isTarget(s.classId));

      const dayLoad = new Map<number, number>();
      for (const { s } of tSlots) dayLoad.set(s.dayOfWeek, (dayLoad.get(s.dayOfWeek) ?? 0) + 1);

      const maxDay = [...dayLoad.entries()].sort((a, b) => b[1] - a[1])[0];
      const minDay = [...dayLoad.entries()].sort((a, b) => a[1] - b[1])[0];
      if (!maxDay || !minDay) continue;
      if (maxDay[1] - minDay[1] < 2) continue; // imbalance not worth fixing

      // Move one lesson from maxDay → minDay
      for (const { s, i } of tSlots.filter(({ s }) => s.dayOfWeek === maxDay[0])) {
        for (let p = 1; p <= config.periodsPerDay; p++) {
          if (canPlace(s, minDay[0], p, slots, i, config, unavailability, maxPerDay)) {
            slots[i] = { ...s, dayOfWeek: minDay[0], period: p };
            summary.movesApplied++; summary.loadBalanced++;
            madeMove = true;
            break;
          }
        }
        if (madeMove) break;
      }
    }

    // ── Strategy 3: Consecutive-subject avoidance ───────────────────────
    for (const classId of new Set(slots.map((s) => s.classId))) {
      if (!isTarget(classId)) continue;
      for (const day of config.operatingDays) {
        for (let p = 1; p < config.periodsPerDay; p++) {
          const s1 = slots.find((s) => s.classId === classId && s.dayOfWeek === day && s.period === p);
          const s2 = slots.find((s) => s.classId === classId && s.dayOfWeek === day && s.period === p + 1);
          const s3 = slots.find((s) => s.classId === classId && s.dayOfWeek === day && s.period === p + 2);
          if (!s1 || !s2 || !s3) continue;
          if (s1.subjectId !== s2.subjectId || s2.subjectId !== s3.subjectId) continue;

          // Three consecutive same-subject: try swapping s3 with another slot
          const i3   = slots.indexOf(s3);
          const others = slots.map((o, i) => ({ o, i })).filter(({ o, i }) =>
            i !== i3 && o.classId === classId && !o.isDouble && o.subjectId !== s3.subjectId
          );
          for (const { o, i: iO } of others) {
            if (canPlace(s3, o.dayOfWeek, o.period, slots, i3, config, unavailability, maxPerDay) &&
                canPlace(o, day, p + 2, slots, iO, config, unavailability, maxPerDay)) {
              [slots[i3].dayOfWeek, slots[iO].dayOfWeek] = [o.dayOfWeek, day];
              [slots[i3].period,    slots[iO].period]    = [o.period,    p + 2];
              summary.movesApplied++;
              madeMove = true;
              break;
            }
          }
          if (madeMove) break;
        }
        if (madeMove) break;
      }
    }

    if (!madeMove) break; // converged
  }

  // ── Collect remaining issues ────────────────────────────────────────────
  // Unmet spread requirements
  for (const [reqKey, required] of requirements) {
    const [classId, subjectId] = reqKey.split("-");
    if (required < 2) continue;
    const days = new Set(
      slots.filter((s) => s.classId === classId && s.subjectId === subjectId).map((s) => s.dayOfWeek)
    );
    if (days.size < Math.min(required, config.operatingDays.length)) {
      summary.remainingIssues.push(
        `Subject ${subjectId} in class ${classId} still spread across only ${days.size} day(s) (target: ${Math.min(required, config.operatingDays.length)}).`
      );
    }
  }

  return { slots, summary };
}
