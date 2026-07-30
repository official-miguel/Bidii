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
