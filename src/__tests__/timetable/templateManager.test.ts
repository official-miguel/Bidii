/**
 * Tests for src/lib/timetable/templateManager.ts
 *
 * Covers:
 *   - Template validation: time format, overlaps, position sequencing
 *   - Column manipulation: add, remove, update, reorder
 *   - Default template generation
 *   - Summary statistics calculation
 *   - Session boundary calculation
 */

import {
  validateTemplate,
  validateColumn,
  generateDefaultTemplate,
  addColumn,
  removeColumn,
  updateColumn,
  reorderColumns,
  getTemplateSummary,
  calculateSessionBoundaries,
  suggestSessionForTime,
  type TemplateColumnInput,
} from "@/lib/timetable/templateManager";
import { TimetableSlotType, TimetableSession } from "@prisma/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_LESSON: TemplateColumnInput = {
  position: 1,
  startTime: "08:00",
  endTime: "08:40",
  slotType: TimetableSlotType.LESSON,
  session: TimetableSession.MORNING,
  label: null,
};

const VALID_BREAK: TemplateColumnInput = {
  position: 2,
  startTime: "08:40",
  endTime: "09:00",
  slotType: TimetableSlotType.BREAK,
  session: TimetableSession.MORNING,
  label: "Morning Break",
};

const SIMPLE_TEMPLATE: TemplateColumnInput[] = [VALID_LESSON, VALID_BREAK];

// ── validateTemplate ──────────────────────────────────────────────────────────

describe("validateTemplate", () => {
  test("valid simple template passes", () => {
    const result = validateTemplate([VALID_LESSON], [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("default template passes validation", () => {
    const cols = generateDefaultTemplate();
    const result = validateTemplate(cols, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(true);
  });

  test("empty columns array fails", () => {
    const result = validateTemplate([], [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "columns")).toBe(true);
  });

  test("no lesson slots fails", () => {
    const breakOnly: TemplateColumnInput[] = [
      { ...VALID_BREAK, position: 1 },
    ];
    const result = validateTemplate(breakOnly, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("empty operating days fails", () => {
    const result = validateTemplate([VALID_LESSON], [], 6);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "operatingDays")).toBe(true);
  });

  test("non-sequential positions fail", () => {
    const nonSeq: TemplateColumnInput[] = [
      { ...VALID_LESSON, position: 1 },
      { ...VALID_BREAK, position: 3 }, // gap at 2
    ];
    const result = validateTemplate(nonSeq, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("invalid time format fails", () => {
    const bad: TemplateColumnInput[] = [
      { ...VALID_LESSON, startTime: "8:0" }, // not HH:MM
    ];
    const result = validateTemplate(bad, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("end time before start time fails", () => {
    const bad: TemplateColumnInput[] = [
      { ...VALID_LESSON, startTime: "09:00", endTime: "08:00" },
    ];
    const result = validateTemplate(bad, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("overlapping times fail", () => {
    const overlapping: TemplateColumnInput[] = [
      { position: 1, startTime: "08:00", endTime: "09:00", slotType: TimetableSlotType.LESSON, session: TimetableSession.MORNING, label: null },
      { position: 2, startTime: "08:30", endTime: "09:30", slotType: TimetableSlotType.LESSON, session: TimetableSession.MORNING, label: null },
    ];
    const result = validateTemplate(overlapping, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("break slot without label fails", () => {
    const noLabel: TemplateColumnInput[] = [
      VALID_LESSON,
      { ...VALID_BREAK, label: null, position: 2 },
    ];
    const result = validateTemplate(noLabel, [0, 1, 2, 3, 4], 6);
    expect(result.valid).toBe(false);
  });

  test("produces warning when max lessons exceeds total slots", () => {
    const result = validateTemplate([VALID_LESSON], [0, 1, 2, 3, 4], 10);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── validateColumn ────────────────────────────────────────────────────────────

describe("validateColumn", () => {
  test("valid lesson column has no errors", () => {
    const errors = validateColumn(VALID_LESSON, [VALID_LESSON]);
    expect(errors).toHaveLength(0);
  });

  test("invalid time format errors", () => {
    const bad = { ...VALID_LESSON, startTime: "8:00" };
    const errors = validateColumn(bad, [bad]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── Column manipulation ───────────────────────────────────────────────────────

describe("addColumn", () => {
  test("adds column at position after last existing column", () => {
    const result = addColumn(SIMPLE_TEMPLATE, {
      startTime: "09:00",
      endTime: "09:40",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
      label: null,
    });
    expect(result).toHaveLength(3);
    expect(result[2].position).toBe(3);
  });

  test("adds to empty template at position 1", () => {
    const result = addColumn([], {
      startTime: "08:00",
      endTime: "08:40",
      slotType: TimetableSlotType.LESSON,
      session: TimetableSession.MORNING,
      label: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].position).toBe(1);
  });
});

describe("removeColumn", () => {
  test("removes column at given position and re-numbers", () => {
    const result = removeColumn(SIMPLE_TEMPLATE, 1);
    expect(result).toHaveLength(1);
    expect(result[0].position).toBe(1);
    expect(result[0].slotType).toBe(TimetableSlotType.BREAK);
  });

  test("removing non-existent position returns unchanged template", () => {
    const result = removeColumn(SIMPLE_TEMPLATE, 99);
    expect(result).toHaveLength(2);
  });
});

describe("updateColumn", () => {
  test("updates specific column by position", () => {
    const result = updateColumn(SIMPLE_TEMPLATE, 1, { endTime: "08:45" });
    expect(result[0].endTime).toBe("08:45");
    expect(result[1].endTime).toBe(VALID_BREAK.endTime);
  });

  test("does not mutate input array", () => {
    const original = [...SIMPLE_TEMPLATE];
    updateColumn(SIMPLE_TEMPLATE, 1, { endTime: "08:45" });
    expect(SIMPLE_TEMPLATE[0].endTime).toBe(original[0].endTime);
  });
});

describe("reorderColumns", () => {
  test("moves column from position 1 to position 2", () => {
    const result = reorderColumns(SIMPLE_TEMPLATE, 1, 2);
    expect(result[0].slotType).toBe(TimetableSlotType.BREAK);
    expect(result[1].slotType).toBe(TimetableSlotType.LESSON);
    // Positions re-numbered
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
  });

  test("reorder same position returns equivalent template", () => {
    const result = reorderColumns(SIMPLE_TEMPLATE, 1, 1);
    expect(result).toHaveLength(SIMPLE_TEMPLATE.length);
    expect(result[0].slotType).toBe(SIMPLE_TEMPLATE[0].slotType);
  });
});

// ── Default template ──────────────────────────────────────────────────────────

describe("generateDefaultTemplate", () => {
  test("returns a valid non-empty template", () => {
    const cols = generateDefaultTemplate();
    expect(cols.length).toBeGreaterThan(0);
  });

  test("all positions are sequential starting from 1", () => {
    const cols = generateDefaultTemplate();
    cols.forEach((col, i) => expect(col.position).toBe(i + 1));
  });

  test("has at least one LESSON and one BREAK/LUNCH", () => {
    const cols = generateDefaultTemplate();
    const lessons = cols.filter((c) => c.slotType === TimetableSlotType.LESSON);
    const breaks = cols.filter(
      (c) =>
        c.slotType === TimetableSlotType.BREAK || c.slotType === TimetableSlotType.LUNCH
    );
    expect(lessons.length).toBeGreaterThan(0);
    expect(breaks.length).toBeGreaterThan(0);
  });

  test("all times are in valid HH:MM format", () => {
    const timeRe = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
    const cols = generateDefaultTemplate();
    for (const col of cols) {
      expect(col.startTime).toMatch(timeRe);
      expect(col.endTime).toMatch(timeRe);
    }
  });

  test("non-LESSON slots have labels", () => {
    const cols = generateDefaultTemplate();
    for (const col of cols) {
      if (col.slotType !== TimetableSlotType.LESSON) {
        expect(col.label).toBeTruthy();
      }
    }
  });
});

// ── Summary statistics ────────────────────────────────────────────────────────

describe("getTemplateSummary", () => {
  test("counts lesson and break slots correctly", () => {
    const cols = generateDefaultTemplate();
    const summary = getTemplateSummary(cols);
    const lessonCount = cols.filter((c) => c.slotType === TimetableSlotType.LESSON).length;
    const breakCount = cols.filter((c) => c.slotType === TimetableSlotType.BREAK).length;
    const lunchCount = cols.filter((c) => c.slotType === TimetableSlotType.LUNCH).length;

    expect(summary.lessonSlots).toBe(lessonCount);
    expect(summary.breakSlots).toBe(breakCount);
    expect(summary.lunchSlots).toBe(lunchCount);
    expect(summary.totalSlots).toBe(cols.length);
  });

  test("morning/afternoon lesson distribution sums to total lessons", () => {
    const cols = generateDefaultTemplate();
    const summary = getTemplateSummary(cols);
    expect(
      summary.morningLessons + summary.afternoonLessons + summary.eveningLessons
    ).toBe(summary.lessonSlots);
  });

  test("averagePeriodMinutes is positive for default template", () => {
    const cols = generateDefaultTemplate();
    const summary = getTemplateSummary(cols);
    expect(summary.averagePeriodMinutes).toBeGreaterThan(0);
  });

  test("totalDurationMinutes is positive for default template", () => {
    const cols = generateDefaultTemplate();
    const summary = getTemplateSummary(cols);
    expect(summary.totalDurationMinutes).toBeGreaterThan(0);
  });
});

// ── Session boundary calculation ──────────────────────────────────────────────

describe("calculateSessionBoundaries", () => {
  test("returns morning boundaries for morning lessons", () => {
    const cols: TemplateColumnInput[] = [
      { position: 1, startTime: "08:00", endTime: "08:40", slotType: TimetableSlotType.LESSON, session: TimetableSession.MORNING, label: null },
      { position: 2, startTime: "08:40", endTime: "09:20", slotType: TimetableSlotType.LESSON, session: TimetableSession.MORNING, label: null },
    ];
    const { morning, afternoon, evening } = calculateSessionBoundaries(cols);
    expect(morning).not.toBeNull();
    expect(morning!.start).toBe("08:00");
    expect(afternoon).toBeNull();
    expect(evening).toBeNull();
  });
});

// ── suggestSessionForTime ─────────────────────────────────────────────────────

describe("suggestSessionForTime", () => {
  test("times before noon are MORNING", () => {
    expect(suggestSessionForTime("08:00")).toBe(TimetableSession.MORNING);
    expect(suggestSessionForTime("11:59")).toBe(TimetableSession.MORNING);
  });

  test("noon to 17:00 is AFTERNOON", () => {
    expect(suggestSessionForTime("12:00")).toBe(TimetableSession.AFTERNOON);
    expect(suggestSessionForTime("16:59")).toBe(TimetableSession.AFTERNOON);
  });

  test("17:00 onwards is EVENING", () => {
    expect(suggestSessionForTime("17:00")).toBe(TimetableSession.EVENING);
    expect(suggestSessionForTime("19:30")).toBe(TimetableSession.EVENING);
  });
});
