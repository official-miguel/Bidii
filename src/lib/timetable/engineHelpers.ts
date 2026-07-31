/**
 * src/lib/timetable/engineHelpers.ts
 *
 * Helper utilities for the deterministic timetable engine
 */

import { TimetableSlotType } from "@prisma/client";
import type { TemplateColumn } from "./deterministicEngine";

/**
 * Extract only lesson columns from template (filters out breaks, lunch, etc.)
 */
export function getLessonColumns(columns: TemplateColumn[]): TemplateColumn[] {
  return columns
    .filter((col) => col.slotType === TimetableSlotType.LESSON)
    .sort((a, b) => a.position - b.position);
}

/**
 * Map period number (1-based) to actual template position
 */
export function periodToTemplatePosition(
  period: number,
  columns: TemplateColumn[]
): number | null {
  const lessonCols = getLessonColumns(columns);
  return lessonCols[period - 1]?.position ?? null;
}

/**
 * Map template position to period number (1-based among lesson slots only)
 */
export function templatePositionToPeriod(
  position: number,
  columns: TemplateColumn[]
): number | null {
  const lessonCols = getLessonColumns(columns);
  const index = lessonCols.findIndex((col) => col.position === position);
  return index >= 0 ? index + 1 : null;
}

/**
 * Get total number of teaching periods per day (excludes breaks/lunch/etc.)
 */
export function getTotalTeachingPeriods(columns: TemplateColumn[]): number {
  return columns.filter((col) => col.slotType === TimetableSlotType.LESSON).length;
}

/**
 * Check if two periods are consecutive (no break/lunch between them)
 */
export function arePeriodsConsecutive(
  period1: number,
  period2: number,
  columns: TemplateColumn[]
): boolean {
  const lessonCols = getLessonColumns(columns);
  const idx1 = period1 - 1;
  const idx2 = period2 - 1;

  if (idx1 < 0 || idx2 < 0 || idx1 >= lessonCols.length || idx2 >= lessonCols.length) {
    return false;
  }

  // Check if positions are adjacent in the full template
  const pos1 = lessonCols[idx1].position;
  const pos2 = lessonCols[idx2].position;

  return Math.abs(pos2 - pos1) === 1;
}

/**
 * Get time range for a period
 */
export function getPeriodTimeRange(
  period: number,
  columns: TemplateColumn[]
): { startTime: string; endTime: string } | null {
  const lessonCols = getLessonColumns(columns);
  const column = lessonCols[period - 1];
  return column ? { startTime: column.startTime, endTime: column.endTime } : null;
}

/**
 * Calculate total required slots for a week
 */
export function calculateWeeklySlotRequirement(
  operatingDays: number[],
  columns: TemplateColumn[]
): number {
  const periodsPerDay = getTotalTeachingPeriods(columns);
  return operatingDays.length * periodsPerDay;
}

/**
 * Group slots by class
 */
export function groupSlotsByClass<T extends { classId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.classId)) {
      grouped.set(slot.classId, []);
    }
    grouped.get(slot.classId)!.push(slot);
  }
  return grouped;
}

/**
 * Group slots by teacher
 */
export function groupSlotsByTeacher<T extends { teacherId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.teacherId)) {
      grouped.set(slot.teacherId, []);
    }
    grouped.get(slot.teacherId)!.push(slot);
  }
  return grouped;
}

/**
 * Group slots by subject
 */
export function groupSlotsBySubject<T extends { subjectId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.subjectId)) {
      grouped.set(slot.subjectId, []);
    }
    grouped.get(slot.subjectId)!.push(slot);
  }
  return grouped;
}

/**
 * Find overlapping slots (same day and period)
 */
export function findOverlappingSlots<T extends { dayOfWeek: number; period: number }>(
  slots: T[]
): T[][] {
  const slotMap = new Map<string, T[]>();

  for (const slot of slots) {
    const key = `${slot.dayOfWeek}-${slot.period}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, []);
    }
    slotMap.get(key)!.push(slot);
  }

  return Array.from(slotMap.values()).filter((group) => group.length > 1);
}

/**
 * Calculate teacher workload distribution
 */
export function calculateTeacherWorkload<T extends { teacherId: string; dayOfWeek: number }>(
  slots: T[]
): Map<string, { totalLessons: number; lessonsPerDay: Map<number, number> }> {
  const workload = new Map<
    string,
    { totalLessons: number; lessonsPerDay: Map<number, number> }
  >();

  for (const slot of slots) {
    if (!workload.has(slot.teacherId)) {
      workload.set(slot.teacherId, {
        totalLessons: 0,
        lessonsPerDay: new Map(),
      });
    }

    const teacherData = workload.get(slot.teacherId)!;
    teacherData.totalLessons++;

    const dayCount = teacherData.lessonsPerDay.get(slot.dayOfWeek) ?? 0;
    teacherData.lessonsPerDay.set(slot.dayOfWeek, dayCount + 1);
  }

  return workload;
}

/**
 * Check if a class has lessons in all teaching periods
 */
export function hasFullCoverage<T extends { dayOfWeek: number; period: number }>(
  slots: T[],
  operatingDays: number[],
  columns: TemplateColumn[]
): boolean {
  const totalSlots = calculateWeeklySlotRequirement(operatingDays, columns);
  return slots.length >= totalSlots;
}

/**
 * Get empty slots for a class
 */
export function getEmptySlots(
  existingSlots: Array<{ dayOfWeek: number; period: number }>,
  operatingDays: number[],
  columns: TemplateColumn[]
): Array<{ dayOfWeek: number; period: number }> {
  const occupied = new Set(
    existingSlots.map((s) => `${s.dayOfWeek}-${s.period}`)
  );

  const totalPeriods = getTotalTeachingPeriods(columns);
  const emptySlots: Array<{ dayOfWeek: number; period: number }> = [];

  for (const day of operatingDays) {
    for (let period = 1; period <= totalPeriods; period++) {
      const key = `${day}-${period}`;
      if (!occupied.has(key)) {
        emptySlots.push({ dayOfWeek: day, period });
      }
    }
  }

  return emptySlots;
}

/**
 * Calculate subject distribution across days
 */
export function getSubjectDayDistribution<
  T extends { subjectId: string; dayOfWeek: number }
>(slots: T[]): Map<string, Set<number>> {
  const distribution = new Map<string, Set<number>>();

  for (const slot of slots) {
    if (!distribution.has(slot.subjectId)) {
      distribution.set(slot.subjectId, new Set());
    }
    distribution.get(slot.subjectId)!.add(slot.dayOfWeek);
  }

  return distribution;
}

/**
 * Get day name from day number
 */
export function getDayName(dayOfWeek: number): string {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[dayOfWeek] ?? "Unknown";
}

/**
 * Format time range
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`;
}

/**
 * Calculate completion percentage
 */
export function calculateCompletionPercentage(
  scheduled: number,
  required: number
): number {
  if (required === 0) return 100;
  return Math.round((scheduled / required) * 100 * 100) / 100;
}

// ─── Elective group synchronisation ──────────────────────────────────────────

/**
 * Shape of a raw ElectiveGroup row returned by Prisma (only the fields we
 * need — keeps this helper independent of the full Prisma client type).
 */
export type RawElectiveGroup = {
  id: string;
  scopeForm: number;          // 0 = school-wide, N = form N
  scopeStreams: string[];      // [] = all streams in the form
  /** How many of the weekly lessons should be scheduled as consecutive double blocks */
  doublesPerWeek?: number;
  members: Array<{ subjectId: string }>;
};

/**
 * Shape of a raw class row (subset of SchoolClass).
 */
export type RawClass = {
  id: string;
  form: number;
  stream: string | null;
};

/**
 * buildLinkedClassGroups
 *
 * Converts raw ElectiveGroup records from the database into the
 * `LinkedClassGroup[]` format expected by the CP-SAT solver.
 *
 * Rules:
 *  - scopeForm === 0  → group applies to ALL classes regardless of form.
 *  - scopeForm > 0    → group applies only to classes in that form.
 *  - scopeStreams = [] → all streams in the scoped form.
 *  - scopeStreams = ['North', 'East'] → only those named streams.
 *
 * Groups with fewer than 2 matching classes are silently dropped (nothing
 * to synchronise).
 */
export function buildLinkedClassGroups(
  electiveGroups: RawElectiveGroup[],
  classes: RawClass[]
): Array<{ subjectIds: string[]; classIds: string[] }> {
  const result: Array<{ subjectIds: string[]; classIds: string[] }> = [];

  for (const group of electiveGroups) {
    const subjectIds = group.members.map((m) => m.subjectId);
    if (subjectIds.length === 0) continue;

    // Determine which classes are in scope
    const inScope = classes.filter((cls) => {
      // Form check
      if (group.scopeForm !== 0 && cls.form !== group.scopeForm) return false;

      // Stream check — only applied when scopeForm > 0 and scopeStreams is non-empty
      if (
        group.scopeForm !== 0 &&
        group.scopeStreams.length > 0 &&
        !group.scopeStreams.includes(cls.stream ?? "")
      ) {
        return false;
      }

      return true;
    });

    if (inScope.length < 2) continue; // nothing to synchronise

    result.push({
      subjectIds,
      classIds: inScope.map((c) => c.id),
    });
  }

  return result;
}

// ─── Group-aware solver payload helpers ──────────────────────────────────────

/**
 * A raw ClassElectiveGroupTeacher row — only the fields we need.
 */
export type RawGroupTeacher = {
  groupId:   string;
  classId:   string;
  subjectId: string;
  teacherId: string;
};

/**
 * A raw SubjectLessonRequirement row as loaded by the generate routes.
 */
export type RawRequirement = {
  subjectId:      string;
  classId:        string;
  lessonsPerWeek: number;
};

/**
 * A raw TeacherAssignment row (from ClassSubjectTeacher).
 */
export type RawTeacherAssignment = {
  classId:   string;
  subjectId: string;
  teacherId: string;
};

/**
 * Describes a single elective group for the purposes of payload-building.
 * Carries just what the helper needs.
 */
export type GroupPayloadDescriptor = {
  groupId:        string;
  /** Subject IDs that belong to this group, in the order they should be sent */
  subjectIds:     string[];
  /** lessonsPerWeek from ElectiveGroup — shared by all subjects in the group */
  lessonsPerWeek: number;
  /**
   * How many of those weekly lessons should be scheduled as consecutive
   * double-lesson blocks.  0 = all singles (default, backward-compatible).
   * When > 0 the anchor subject sent to the solver will have doubleLesson=true
   * so the CP-SAT engine places consecutive pairs.
   */
  doublesPerWeek: number;
  /** Classes that are in scope for this group */
  classIds:       string[];
};

/**
 * Return type of buildGroupAwarePayload.
 */
export type GroupAwarePayload = {
  /**
   * Modified requirements list: group subjects are collapsed so only the
   * ANCHOR subject (first in subjectIds) has a requirement row; the rest
   * are dropped so the solver schedules exactly one slot per period.
   */
  requirements: RawRequirement[];
  /**
   * Augmented teacher assignments: ClassSubjectTeacher rows PLUS one
   * synthetic row per (classId, anchorSubjectId) pointing to the first
   * teacher found in ClassElectiveGroupTeacher for that group+class.
   * The solver only needs one teacher per (class, subject) pair — parallel
   * teachers for the same group subject are handled in the fan-out step.
   */
  teacherAssignments: RawTeacherAssignment[];
  /**
   * Fan-out map: anchorSubjectId → list of all (subjectId, teacherId) pairs
   * (including the anchor itself) that should be emitted per solved slot.
   * Key is "classId:anchorSubjectId" so different classes in the same group
   * can have different teacher sets.
   */
  fanOutMap: Map<string, Array<{ subjectId: string; teacherId: string }>>;
  /**
   * Set of anchor subjectIds that belong to a group with doublesPerWeek > 0.
   * The generate route uses this to override doubleLesson=true on those
   * subjects when building the solver payload — without mutating the shared
   * subject map.
   */
  doubleAnchorSubjectIds: Set<string>;
};

/**
 * buildGroupAwarePayload
 *
 * Transforms raw requirements and teacher assignments so the CP-SAT solver
 * treats each elective group as a single atomic slot instead of N independent
 * lessons.
 *
 * Algorithm
 * ---------
 * For every ElectiveGroup that has ≥1 member subject:
 *
 *   1. Identify the ANCHOR subject — the first subjectId in the group.
 *
 *   2. For every class in the group's scope:
 *        a. Remove every group subject's SubjectLessonRequirement EXCEPT the
 *           anchor's.  Set the anchor's lessonsPerWeek = group.lessonsPerWeek.
 *        b. Build a synthetic TeacherAssignment for (classId, anchorSubjectId)
 *           pointing to the first teacher assigned to the anchor subject in
 *           ClassElectiveGroupTeacher for this class.  If no teacher is found,
 *           emit a warning-safe no-op (the solver will warn about missing teacher).
 *        c. Record the full fan-out list: anchor slot → one slot per group
 *           subject with its own teacher from ClassElectiveGroupTeacher.
 *
 * Subjects that belong to no group pass through unchanged.
 */
export function buildGroupAwarePayload(
  requirements:       RawRequirement[],
  teacherAssignments: RawTeacherAssignment[],
  groups:             GroupPayloadDescriptor[],
  groupTeachers:      RawGroupTeacher[],
): GroupAwarePayload {
  // Build a lookup: "groupId:classId:subjectId" → teacherId[]
  const gtLookup = new Map<string, string[]>();
  for (const gt of groupTeachers) {
    const key = `${gt.groupId}:${gt.classId}:${gt.subjectId}`;
    const list = gtLookup.get(key) ?? [];
    list.push(gt.teacherId);
    gtLookup.set(key, list);
  }

  // Track which (classId, subjectId) pairs are owned by a group
  // so we can strip them from requirements and assignments.
  // Maps "classId:subjectId" → { groupId, isAnchor }
  const groupOwnership = new Map<string, { groupId: string; isAnchor: boolean }>();

  // Fan-out map: "classId:anchorSubjectId" → [{ subjectId, teacherId }]
  const fanOutMap = new Map<string, Array<{ subjectId: string; teacherId: string }>>();

  // Synthetic teacher assignments for anchors
  const syntheticAssignments: RawTeacherAssignment[] = [];

  // Anchor subject IDs whose group has doublesPerWeek > 0
  const doubleAnchorSubjectIds = new Set<string>();

  for (const group of groups) {
    if (group.subjectIds.length === 0) continue;
    const anchorSubjectId = group.subjectIds[0];

    // If the group has any double blocks, mark the anchor so the generate
    // route can override doubleLesson=true on the solver subject payload.
    if ((group.doublesPerWeek ?? 0) > 0) {
      doubleAnchorSubjectIds.add(anchorSubjectId);
    }

    for (const classId of group.classIds) {
      // Mark all subjects in the group for this class
      for (let i = 0; i < group.subjectIds.length; i++) {
        const sid = group.subjectIds[i];
        groupOwnership.set(`${classId}:${sid}`, {
          groupId:  group.groupId,
          isAnchor: i === 0,
        });
      }

      // Build fan-out list for this class+anchor
      const fanOutKey = `${classId}:${anchorSubjectId}`;
      const fanOutEntries: Array<{ subjectId: string; teacherId: string }> = [];

      for (const sid of group.subjectIds) {
        const gtKey    = `${group.groupId}:${classId}:${sid}`;
        const teachers = gtLookup.get(gtKey) ?? [];
        // One slot per teacher (each teacher = one student sub-group).
        // If no teacher is assigned fall back to a placeholder "" so the
        // solver will emit a "no teacher" warning rather than crashing.
        if (teachers.length === 0) {
          fanOutEntries.push({ subjectId: sid, teacherId: "" });
        } else {
          for (const tid of teachers) {
            fanOutEntries.push({ subjectId: sid, teacherId: tid });
          }
        }
      }

      fanOutMap.set(fanOutKey, fanOutEntries);

      // Synthetic teacher assignment for the anchor (first teacher of anchor subject)
      const anchorGtKey = `${group.groupId}:${classId}:${anchorSubjectId}`;
      const anchorTeachers = gtLookup.get(anchorGtKey) ?? [];
      if (anchorTeachers.length > 0) {
        syntheticAssignments.push({
          classId,
          subjectId: anchorSubjectId,
          teacherId: anchorTeachers[0],
        });
      }
      // If no teacher for anchor, we intentionally skip — the solver will warn.
    }
  }

  // ── Filter requirements ────────────────────────────────────────────────
  // Keep non-group rows as-is.
  // For group rows: keep only the anchor, replacing its lessonsPerWeek with
  // the group's lessonsPerWeek.
  const groupLpwMap = new Map<string, number>(); // "groupId" → lessonsPerWeek
  for (const g of groups) groupLpwMap.set(g.groupId, g.lessonsPerWeek);

  const filteredRequirements: RawRequirement[] = [];
  for (const req of requirements) {
    const ownerKey = `${req.classId}:${req.subjectId}`;
    const ownership = groupOwnership.get(ownerKey);

    if (!ownership) {
      // Not a group subject — pass through unchanged
      filteredRequirements.push(req);
      continue;
    }

    if (ownership.isAnchor) {
      // Replace lessonsPerWeek with the group's value
      const lpw = groupLpwMap.get(ownership.groupId) ?? req.lessonsPerWeek;
      filteredRequirements.push({ ...req, lessonsPerWeek: lpw });
    }
    // Non-anchor group subjects are dropped
  }

  // ── Filter teacher assignments ─────────────────────────────────────────
  // Remove any ClassSubjectTeacher entries for group subjects (they belong
  // in ClassElectiveGroupTeacher instead), then add synthetic anchor entries.
  const filteredAssignments = teacherAssignments.filter((a) => {
    const key = `${a.classId}:${a.subjectId}`;
    return !groupOwnership.has(key); // drop group-owned subjects
  });

  // Deduplicate synthetics (in case the same anchor already exists in
  // ClassSubjectTeacher for some reason)
  const assignmentKeys = new Set(filteredAssignments.map((a) => `${a.classId}:${a.subjectId}`));
  for (const sa of syntheticAssignments) {
    const key = `${sa.classId}:${sa.subjectId}`;
    if (!assignmentKeys.has(key)) {
      filteredAssignments.push(sa);
      assignmentKeys.add(key);
    }
  }

  return {
    requirements:           filteredRequirements,
    teacherAssignments:     filteredAssignments,
    fanOutMap,
    doubleAnchorSubjectIds,
  };
}

/**
 * fanOutGroupSlots
 *
 * Takes the solver output (one slot per anchor subject per class) and expands
 * it back into the full set of slots — one per subject in each group (with
 * its own teacher), plus one per teacher for multi-teacher groups.
 *
 * Non-group slots are passed through unchanged.
 */
export function fanOutGroupSlots(
  solverSlots: Array<{
    classId:   string;
    dayOfWeek: number;
    period:    number;
    subjectId: string;
    teacherId: string;
    room:      string | null;
  }>,
  fanOutMap: Map<string, Array<{ subjectId: string; teacherId: string }>>,
  /** Set of "classId:subjectId" pairs that are anchor subjects */
  anchorKeys: Set<string>,
): typeof solverSlots {
  const result: typeof solverSlots = [];

  for (const slot of solverSlots) {
    const key = `${slot.classId}:${slot.subjectId}`;

    if (!anchorKeys.has(key)) {
      // Not a group anchor — emit as-is
      result.push(slot);
      continue;
    }

    // Expand into one slot per (subject, teacher) entry
    const entries = fanOutMap.get(key) ?? [];
    for (const entry of entries) {
      if (!entry.teacherId) continue; // skip unassigned
      result.push({
        classId:   slot.classId,
        dayOfWeek: slot.dayOfWeek,
        period:    slot.period,
        subjectId: entry.subjectId,
        teacherId: entry.teacherId,
        room:      slot.room,
      });
    }
  }

  return result;
}
