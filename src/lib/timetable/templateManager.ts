/**
 * src/lib/timetable/templateManager.ts
 *
 * Manages timetable template configuration - the editable format that defines
 * what each school's timetable looks like (time ranges, lesson vs break slots).
 * 
 * Schools configure this ONCE, then every class's timetable follows the same format.
 */

import { TimetableSlotType, TimetableSession } from "@prisma/client";

export type TemplateColumnInput = {
  position: number;
  startTime: string; // "HH:MM" 24-hour format
  endTime: string;
  slotType: TimetableSlotType;
  label?: string | null;
  session: TimetableSession;
};

export type TemplateColumn = TemplateColumnInput & {
  id: string;
  configId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TemplateConfig = {
  schoolId: string;
  academicYear: string | null;
  term: number | null;
  operatingDays: number[];
  maxLessonsPerTeacherPerDay: number;
  columns: TemplateColumn[];
};

export type TemplateValidationError = {
  field: string;
  message: string;
};

export type TemplateValidationResult = {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: string[];
};

/**
 * Validate time format (HH:MM)
 */
function isValidTimeFormat(time: string): boolean {
  const regex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time);
}

/**
 * Parse time string to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes to time string
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Validate a single template column
 */
export function validateColumn(
  column: TemplateColumnInput,
  allColumns: TemplateColumnInput[]
): TemplateValidationError[] {
  const errors: TemplateValidationError[] = [];

  // Validate time format
  if (!isValidTimeFormat(column.startTime)) {
    errors.push({
      field: `column-${column.position}-startTime`,
      message: `Invalid start time format. Use HH:MM (24-hour)`,
    });
  }

  if (!isValidTimeFormat(column.endTime)) {
    errors.push({
      field: `column-${column.position}-endTime`,
      message: `Invalid end time format. Use HH:MM (24-hour)`,
    });
  }

  // Validate time logic
  if (isValidTimeFormat(column.startTime) && isValidTimeFormat(column.endTime)) {
    const startMins = timeToMinutes(column.startTime);
    const endMins = timeToMinutes(column.endTime);

    if (endMins <= startMins) {
      errors.push({
        field: `column-${column.position}`,
        message: `End time must be after start time`,
      });
    }

    // Check for overlaps with other columns
    for (const other of allColumns) {
      if (other.position === column.position) continue;

      if (
        isValidTimeFormat(other.startTime) &&
        isValidTimeFormat(other.endTime)
      ) {
        const otherStart = timeToMinutes(other.startTime);
        const otherEnd = timeToMinutes(other.endTime);

        // Check for overlap
        if (
          (startMins >= otherStart && startMins < otherEnd) ||
          (endMins > otherStart && endMins <= otherEnd) ||
          (startMins <= otherStart && endMins >= otherEnd)
        ) {
          errors.push({
            field: `column-${column.position}`,
            message: `Time overlaps with column at position ${other.position}`,
          });
        }
      }
    }
  }

  // Validate position
  if (column.position < 1) {
    errors.push({
      field: `column-${column.position}-position`,
      message: `Position must be 1 or greater`,
    });
  }

  // Validate label for non-lesson slots
  if (column.slotType !== TimetableSlotType.LESSON && !column.label) {
    errors.push({
      field: `column-${column.position}-label`,
      message: `${column.slotType} slots require a label`,
    });
  }

  return errors;
}

/**
 * Validate entire template configuration
 */
export function validateTemplate(
  columns: TemplateColumnInput[],
  operatingDays: number[],
  maxLessonsPerTeacherPerDay: number
): TemplateValidationResult {
  const errors: TemplateValidationError[] = [];
  const warnings: string[] = [];

  // Check for at least one column
  if (columns.length === 0) {
    errors.push({
      field: "columns",
      message: "Template must have at least one column",
    });
    return { valid: false, errors, warnings };
  }

  // Validate positions are sequential starting from 1
  const positions = columns.map((c) => c.position).sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] !== i + 1) {
      errors.push({
        field: "columns",
        message: `Column positions must be sequential starting from 1. Missing position ${i + 1}`,
      });
      break;
    }
  }

  // Check for duplicate positions
  const positionSet = new Set(positions);
  if (positionSet.size !== positions.length) {
    errors.push({
      field: "columns",
      message: "Duplicate column positions found",
    });
  }

  // Validate each column
  for (const column of columns) {
    const columnErrors = validateColumn(column, columns);
    errors.push(...columnErrors);
  }

  // Check for at least one lesson slot
  const lessonCount = columns.filter(
    (c) => c.slotType === TimetableSlotType.LESSON
  ).length;

  if (lessonCount === 0) {
    errors.push({
      field: "columns",
      message: "Template must have at least one LESSON slot",
    });
  }

  // Validate operating days
  if (operatingDays.length === 0) {
    errors.push({
      field: "operatingDays",
      message: "At least one operating day must be selected",
    });
  }

  for (const day of operatingDays) {
    if (day < 0 || day > 6) {
      errors.push({
        field: "operatingDays",
        message: `Invalid day number: ${day}. Must be 0-6 (Monday-Sunday)`,
      });
    }
  }

  // Validate max lessons per teacher
  if (maxLessonsPerTeacherPerDay < 1) {
    errors.push({
      field: "maxLessonsPerTeacherPerDay",
      message: "Must be at least 1",
    });
  }

  if (maxLessonsPerTeacherPerDay > lessonCount) {
    warnings.push(
      `Max lessons per teacher (${maxLessonsPerTeacherPerDay}) exceeds total lesson slots (${lessonCount})`
    );
  }

  // Check for reasonable break placement
  const breakSlots = columns.filter(
    (c) =>
      c.slotType === TimetableSlotType.BREAK ||
      c.slotType === TimetableSlotType.LUNCH
  );

  if (breakSlots.length === 0 && lessonCount > 4) {
    warnings.push("Consider adding breaks for student wellness (no breaks found)");
  }

  // Check session distribution
  const sessions = {
    MORNING: 0,
    AFTERNOON: 0,
    EVENING: 0,
  };

  for (const column of columns) {
    if (column.slotType === TimetableSlotType.LESSON) {
      sessions[column.session]++;
    }
  }

  if (sessions.MORNING === 0 && lessonCount > 0) {
    warnings.push("No morning lesson slots defined");
  }

  if (sessions.AFTERNOON === 0 && lessonCount > 3) {
    warnings.push("Consider distributing lessons across morning and afternoon");
  }

  // Check total day length
  if (columns.length > 0 && errors.length === 0) {
    const sortedByTime = [...columns].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

    const firstStart = timeToMinutes(sortedByTime[0].startTime);
    const lastEnd = timeToMinutes(sortedByTime[sortedByTime.length - 1].endTime);
    const totalMinutes = lastEnd - firstStart;

    if (totalMinutes > 600) {
      // More than 10 hours
      warnings.push(
        `School day is ${Math.floor(totalMinutes / 60)} hours ${totalMinutes % 60} minutes. Consider reducing for student wellness.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate a default template for a school (common Kenya school format)
 */
export function generateDefaultTemplate(): TemplateColumnInput[] {
  return [
    {
      position: 1,
      startTime: "08:00",
      endTime: "08:40",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 2,
      startTime: "08:40",
      endTime: "09:20",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 3,
      startTime: "09:20",
      endTime: "10:00",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 4,
      startTime: "10:00",
      endTime: "10:20",
      slotType: TimetableSlotType.BREAK,
      label: "Morning Break",
      session: TimetableSession.MORNING,
    },
    {
      position: 5,
      startTime: "10:20",
      endTime: "11:00",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 6,
      startTime: "11:00",
      endTime: "11:40",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 7,
      startTime: "11:40",
      endTime: "12:20",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
    },
    {
      position: 8,
      startTime: "12:20",
      endTime: "13:00",
      slotType: TimetableSlotType.LUNCH,
      label: "Lunch Break",
      session: TimetableSession.AFTERNOON,
    },
    {
      position: 9,
      startTime: "13:00",
      endTime: "13:40",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.AFTERNOON,
    },
    {
      position: 10,
      startTime: "13:40",
      endTime: "14:20",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.AFTERNOON,
    },
    {
      position: 11,
      startTime: "14:20",
      endTime: "15:00",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.AFTERNOON,
    },
  ];
}

/**
 * Calculate session boundaries based on column times
 */
export function calculateSessionBoundaries(columns: TemplateColumnInput[]): {
  morning: { start: string; end: string } | null;
  afternoon: { start: string; end: string } | null;
  evening: { start: string; end: string } | null;
} {
  const sessions = {
    MORNING: [] as string[],
    AFTERNOON: [] as string[],
    EVENING: [] as string[],
  };

  for (const col of columns) {
    if (col.slotType === TimetableSlotType.LESSON) {
      sessions[col.session].push(col.startTime, col.endTime);
    }
  }

  const getBoundaries = (times: string[]) => {
    if (times.length === 0) return null;
    const minutes = times.map(timeToMinutes);
    return {
      start: minutesToTime(Math.min(...minutes)),
      end: minutesToTime(Math.max(...minutes)),
    };
  };

  return {
    morning: getBoundaries(sessions.MORNING),
    afternoon: getBoundaries(sessions.AFTERNOON),
    evening: getBoundaries(sessions.EVENING),
  };
}

/**
 * Suggest optimal session assignment for a time
 */
export function suggestSessionForTime(time: string): TimetableSession {
  const minutes = timeToMinutes(time);

  // Morning: before 12:00
  if (minutes < 720) return TimetableSession.MORNING;

  // Afternoon: 12:00 - 17:00
  if (minutes < 1020) return TimetableSession.AFTERNOON;

  // Evening: after 17:00
  return TimetableSession.EVENING;
}

/**
 * Add a new column to template
 */
export function addColumn(
  existingColumns: TemplateColumnInput[],
  newColumn: Omit<TemplateColumnInput, "position">
): TemplateColumnInput[] {
  // Find the next available position
  const positions = existingColumns.map((c) => c.position);
  const maxPosition = positions.length > 0 ? Math.max(...positions) : 0;

  const columnWithPosition: TemplateColumnInput = {
    ...newColumn,
    position: maxPosition + 1,
  };

  return [...existingColumns, columnWithPosition];
}

/**
 * Remove a column from template
 */
export function removeColumn(
  existingColumns: TemplateColumnInput[],
  position: number
): TemplateColumnInput[] {
  const filtered = existingColumns.filter((c) => c.position !== position);

  // Re-number positions sequentially
  return filtered.map((col, index) => ({
    ...col,
    position: index + 1,
  }));
}

/**
 * Update a column in template
 */
export function updateColumn(
  existingColumns: TemplateColumnInput[],
  position: number,
  updates: Partial<Omit<TemplateColumnInput, "position">>
): TemplateColumnInput[] {
  return existingColumns.map((col) =>
    col.position === position ? { ...col, ...updates } : col
  );
}

/**
 * Reorder columns
 */
export function reorderColumns(
  existingColumns: TemplateColumnInput[],
  fromPosition: number,
  toPosition: number
): TemplateColumnInput[] {
  const columns = [...existingColumns];
  const fromIndex = columns.findIndex((c) => c.position === fromPosition);
  const toIndex = columns.findIndex((c) => c.position === toPosition);

  if (fromIndex === -1 || toIndex === -1) {
    throw new Error("Invalid positions for reordering");
  }

  // Remove from old position
  const [removed] = columns.splice(fromIndex, 1);

  // Insert at new position
  columns.splice(toIndex, 0, removed);

  // Re-number all positions
  return columns.map((col, index) => ({
    ...col,
    position: index + 1,
  }));
}

/**
 * Get summary statistics for a template
 */
export function getTemplateSummary(columns: TemplateColumnInput[]): {
  totalSlots: number;
  lessonSlots: number;
  breakSlots: number;
  lunchSlots: number;
  gamesSlots: number;
  assemblySlots: number;
  morningLessons: number;
  afternoonLessons: number;
  eveningLessons: number;
  totalDurationMinutes: number;
  averagePeriodMinutes: number;
} {
  const lessonSlots = columns.filter((c) => c.slotType === TimetableSlotType.LESSON);

  const summary = {
    totalSlots: columns.length,
    lessonSlots: lessonSlots.length,
    breakSlots: columns.filter((c) => c.slotType === TimetableSlotType.BREAK).length,
    lunchSlots: columns.filter((c) => c.slotType === TimetableSlotType.LUNCH).length,
    gamesSlots: columns.filter((c) => c.slotType === TimetableSlotType.GAMES).length,
    assemblySlots: columns.filter((c) => c.slotType === TimetableSlotType.ASSEMBLY)
      .length,
    morningLessons: lessonSlots.filter((c) => c.session === TimetableSession.MORNING)
      .length,
    afternoonLessons: lessonSlots.filter(
      (c) => c.session === TimetableSession.AFTERNOON
    ).length,
    eveningLessons: lessonSlots.filter((c) => c.session === TimetableSession.EVENING)
      .length,
    totalDurationMinutes: 0,
    averagePeriodMinutes: 0,
  };

  if (columns.length > 0) {
    const sortedByTime = [...columns].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

    const firstStart = timeToMinutes(sortedByTime[0].startTime);
    const lastEnd = timeToMinutes(sortedByTime[sortedByTime.length - 1].endTime);
    summary.totalDurationMinutes = lastEnd - firstStart;

    // Calculate average lesson duration
    if (lessonSlots.length > 0) {
      const totalLessonMinutes = lessonSlots.reduce((sum, col) => {
        return sum + (timeToMinutes(col.endTime) - timeToMinutes(col.startTime));
      }, 0);
      summary.averagePeriodMinutes = Math.round(totalLessonMinutes / lessonSlots.length);
    }
  }

  return summary;
}
