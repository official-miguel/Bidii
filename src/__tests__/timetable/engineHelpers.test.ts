/**
 * Tests for src/lib/timetable/engineHelpers.ts and sessionAllocator.ts
 *
 * Covers all utility functions used by the engine and session allocator.
 */

import * as fc from "fast-check";
import {
  getLessonColumns,
  periodToTemplatePosition,
  templatePositionToPeriod,
  getTotalTeachingPeriods,
  groupSlotsByClass,
  groupSlotsByTeacher,
  groupSlotsBySubject,
  findOverlappingSlots,
  calculateTeacherWorkload,
  getEmptySlots,
  getSubjectDayDistribution,
  calculateCompletionPercentage,
} from "@/lib/timetable/engineHelpers";
import {
  getPeriodsInSession,
  getSessionForPeriod,
  calculateSessionDistribution,
  getSessionName,
  getSessionColor,
} from "@/lib/timetable/sessionAllocator";
import { TimetableSlotType, TimetableSession } from "@prisma/client";
import type { TemplateColumn } from "@/lib/timetable/deterministicEngine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCol(
  position: number,
  slotType: TimetableSlotType = TimetableSlotType.LESSON,
  session: TimetableSession = TimetableSession.MORNING
): TemplateColumn {
  return {
    position,
    startTime: `${String(7 + position).padStart(2, "0")}:00`,
    endTime: `${String(8 + position).padStart(2, "0")}:00`,
    slotType,
    session,
    label: slotType !== TimetableSlotType.LESSON ? "Break" : null,
  };
}

/** 3 lessons + 1 break + 2 lessons */
const MIXED_COLUMNS: TemplateColumn[] = [
  makeCol(1, TimetableSlotType.LESSON, TimetableSession.MORNING),
  makeCol(2, TimetableSlotType.LESSON, TimetableSession.MORNING),
  makeCol(3, TimetableSlotType.LESSON, TimetableSession.MORNING),
  makeCol(4, TimetableSlotType.BREAK),
  makeCol(5, TimetableSlotType.LESSON, TimetableSession.AFTERNOON),
  makeCol(6, TimetableSlotType.LESSON, TimetableSession.AFTERNOON),
];

const LESSON_ONLY_COLUMNS: TemplateColumn[] = [1, 2, 3, 4, 5].map((p) => makeCol(p));

// ── getLessonColumns ──────────────────────────────────────────────────────────

describe("getLessonColumns", () => {
  test("filters out non-lesson columns", () => {
    const cols = getLessonColumns(MIXED_COLUMNS);
    expect(cols).toHaveLength(5); // 6 - 1 break
    expect(cols.every((c) => c.slotType === TimetableSlotType.LESSON)).toBe(true);
  });

  test("returns all columns when all are lessons", () => {
    const cols = getLessonColumns(LESSON_ONLY_COLUMNS);
    expect(cols).toHaveLength(5);
  });

  test("returns empty for all-break template", () => {
    const breaks = [makeCol(1, TimetableSlotType.BREAK)];
    expect(getLessonColumns(breaks)).toHaveLength(0);
  });

  test("results are sorted by position", () => {
    const shuffled = [...MIXED_COLUMNS].reverse();
    const cols = getLessonColumns(shuffled);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i].position).toBeGreaterThan(cols[i - 1].position);
    }
  });
});

// ── periodToTemplatePosition / templatePositionToPeriod ───────────────────────

describe("period ↔ template position mapping", () => {
  test("period 1 maps to first lesson column position", () => {
    const pos = periodToTemplatePosition(1, MIXED_COLUMNS);
    const firstLesson = getLessonColumns(MIXED_COLUMNS)[0];
    expect(pos).toBe(firstLesson.position);
  });

  test("period 4 maps to position 5 (skipping the break at position 4)", () => {
    // Lesson columns: positions 1,2,3,5,6 → period 4 = position 5
    expect(periodToTemplatePosition(4, MIXED_COLUMNS)).toBe(5);
  });

  test("out-of-range period returns null", () => {
    expect(periodToTemplatePosition(99, MIXED_COLUMNS)).toBeNull();
    expect(periodToTemplatePosition(0, MIXED_COLUMNS)).toBeNull();
  });

  test("round-trip: period → position → period", () => {
    const cols = MIXED_COLUMNS;
    for (let period = 1; period <= getLessonColumns(cols).length; period++) {
      const pos = periodToTemplatePosition(period, cols);
      expect(pos).not.toBeNull();
      const backToPeriod = templatePositionToPeriod(pos!, cols);
      expect(backToPeriod).toBe(period);
    }
  });
});

// ── getTotalTeachingPeriods ───────────────────────────────────────────────────

describe("getTotalTeachingPeriods", () => {
  test("counts only LESSON columns", () => {
    expect(getTotalTeachingPeriods(MIXED_COLUMNS)).toBe(5);
  });

  test("returns 0 for empty template", () => {
    expect(getTotalTeachingPeriods([])).toBe(0);
  });

  test("property: equals getLessonColumns length", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(...Object.values(TimetableSlotType)),
          { minLength: 0, maxLength: 12 }
        ),
        (types) => {
          const cols = types.map((t, i) =>
            makeCol(i + 1, t as TimetableSlotType)
          );
          expect(getTotalTeachingPeriods(cols)).toBe(getLessonColumns(cols).length);
        }
      )
    );
  });
});

// ── groupSlotsByClass / Teacher / Subject ─────────────────────────────────────

describe("groupSlotsByClass", () => {
  const slots = [
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
    { classId: "c2", teacherId: "t2", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 1, period: 1, room: null },
  ];

  test("groups all slots by classId", () => {
    const grouped = groupSlotsByClass(slots);
    expect(grouped.size).toBe(2);
    expect(grouped.get("c1")).toHaveLength(2);
    expect(grouped.get("c2")).toHaveLength(1);
  });
});

describe("groupSlotsByTeacher", () => {
  const slots = [
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
    { classId: "c2", teacherId: "t1", subjectId: "s2", dayOfWeek: 0, period: 2, room: null },
    { classId: "c3", teacherId: "t2", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
  ];

  test("groups all slots by teacherId", () => {
    const grouped = groupSlotsByTeacher(slots);
    expect(grouped.size).toBe(2);
    expect(grouped.get("t1")).toHaveLength(2);
    expect(grouped.get("t2")).toHaveLength(1);
  });
});

describe("groupSlotsBySubject", () => {
  const slots = [
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
    { classId: "c1", teacherId: "t1", subjectId: "s2", dayOfWeek: 0, period: 2, room: null },
    { classId: "c2", teacherId: "t2", subjectId: "s1", dayOfWeek: 1, period: 1, room: null },
  ];

  test("groups all slots by subjectId", () => {
    const grouped = groupSlotsBySubject(slots);
    expect(grouped.get("s1")).toHaveLength(2);
    expect(grouped.get("s2")).toHaveLength(1);
  });
});

// ── findOverlappingSlots ──────────────────────────────────────────────────────

describe("findOverlappingSlots", () => {
  test("returns empty when no overlaps", () => {
    const slots = [
      { dayOfWeek: 0, period: 1 },
      { dayOfWeek: 0, period: 2 },
      { dayOfWeek: 1, period: 1 },
    ];
    expect(findOverlappingSlots(slots)).toHaveLength(0);
  });

  test("detects two slots at same day/period", () => {
    const slots = [
      { dayOfWeek: 0, period: 1 },
      { dayOfWeek: 0, period: 1 }, // overlap
      { dayOfWeek: 1, period: 1 },
    ];
    const overlaps = findOverlappingSlots(slots);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toHaveLength(2);
  });
});

// ── calculateTeacherWorkload ──────────────────────────────────────────────────

describe("calculateTeacherWorkload", () => {
  const slots = [
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 0, period: 1, room: null },
    { classId: "c2", teacherId: "t1", subjectId: "s1", dayOfWeek: 0, period: 2, room: null },
    { classId: "c1", teacherId: "t1", subjectId: "s1", dayOfWeek: 1, period: 1, room: null },
    { classId: "c1", teacherId: "t2", subjectId: "s2", dayOfWeek: 0, period: 1, room: null },
  ];

  test("totals lessons correctly per teacher", () => {
    const workload = calculateTeacherWorkload(slots);
    expect(workload.get("t1")?.totalLessons).toBe(3);
    expect(workload.get("t2")?.totalLessons).toBe(1);
  });

  test("day breakdown is correct", () => {
    const workload = calculateTeacherWorkload(slots);
    const t1 = workload.get("t1")!;
    expect(t1.lessonsPerDay.get(0)).toBe(2);
    expect(t1.lessonsPerDay.get(1)).toBe(1);
  });
});

// ── getEmptySlots ─────────────────────────────────────────────────────────────

describe("getEmptySlots", () => {
  test("returns all slots when none are occupied", () => {
    const empty = getEmptySlots([], [0, 1, 2, 3, 4], LESSON_ONLY_COLUMNS);
    expect(empty).toHaveLength(5 * 5); // 5 lessons × 5 days
  });

  test("excludes occupied slots", () => {
    const occupied = [{ dayOfWeek: 0, period: 1 }];
    const empty = getEmptySlots(occupied, [0, 1, 2, 3, 4], LESSON_ONLY_COLUMNS);
    // 25 total - 1 occupied = 24
    expect(empty).toHaveLength(24);
    expect(empty.every((s) => !(s.dayOfWeek === 0 && s.period === 1))).toBe(true);
  });
});

// ── calculateCompletionPercentage ─────────────────────────────────────────────

describe("calculateCompletionPercentage", () => {
  test("100% when all scheduled", () => {
    expect(calculateCompletionPercentage(10, 10)).toBe(100);
  });

  test("0% when nothing scheduled", () => {
    expect(calculateCompletionPercentage(0, 10)).toBe(0);
  });

  test("100% when required is 0", () => {
    expect(calculateCompletionPercentage(0, 0)).toBe(100);
  });

  test("rounds to 2 decimal places", () => {
    const result = calculateCompletionPercentage(1, 3);
    expect(result).toBeCloseTo(33.33, 2);
  });
});

// ── sessionAllocator — getPeriodsInSession ────────────────────────────────────

describe("sessionAllocator — getPeriodsInSession", () => {
  test("returns period numbers for morning lessons only", () => {
    const morningPeriods = getPeriodsInSession(TimetableSession.MORNING, MIXED_COLUMNS);
    // MIXED_COLUMNS has 3 morning lessons at positions 1,2,3 → periods 1,2,3
    expect(morningPeriods).toEqual([1, 2, 3]);
  });

  test("returns period numbers for afternoon lessons only", () => {
    const afternoonPeriods = getPeriodsInSession(TimetableSession.AFTERNOON, MIXED_COLUMNS);
    // MIXED_COLUMNS: 3 morning + 1 break + 2 afternoon
    // Afternoon lesson columns are at positions 5,6, which are the 4th and 5th lesson-only columns
    // getPeriodsInSession returns index+1 relative to filtered afternoon columns only
    expect(afternoonPeriods).toHaveLength(2);
    // They should be sequential 1-based positions within the afternoon filter
    expect(afternoonPeriods[0]).toBe(1);
    expect(afternoonPeriods[1]).toBe(2);
  });

  test("returns empty for evening when no evening columns", () => {
    const eveningPeriods = getPeriodsInSession(TimetableSession.EVENING, MIXED_COLUMNS);
    expect(eveningPeriods).toHaveLength(0);
  });
});

// ── sessionAllocator — getSessionForPeriod ────────────────────────────────────

describe("sessionAllocator — getSessionForPeriod", () => {
  test("period 1 is MORNING in mixed columns", () => {
    expect(getSessionForPeriod(1, MIXED_COLUMNS)).toBe(TimetableSession.MORNING);
  });

  test("period 4 is AFTERNOON in mixed columns", () => {
    expect(getSessionForPeriod(4, MIXED_COLUMNS)).toBe(TimetableSession.AFTERNOON);
  });

  test("out-of-range period returns null", () => {
    expect(getSessionForPeriod(99, MIXED_COLUMNS)).toBeNull();
  });
});

// ── sessionAllocator — calculateSessionDistribution ───────────────────────────

describe("sessionAllocator — calculateSessionDistribution", () => {
  test("distributes slots correctly across sessions", () => {
    const dist = calculateSessionDistribution(MIXED_COLUMNS, [0, 1, 2, 3, 4]);

    // 3 morning lessons × 5 days = 15 morning slots
    expect(dist.morning.availableSlots).toBe(3 * 5);
    // 2 afternoon lessons × 5 days = 10 afternoon slots
    expect(dist.afternoon.availableSlots).toBe(2 * 5);
    // no evening
    expect(dist.evening.availableSlots).toBe(0);
    // total = 25
    expect(dist.totalSlots).toBe(5 * 5);
  });

  test("balanced flag is true for reasonably balanced sessions", () => {
    const dist = calculateSessionDistribution(MIXED_COLUMNS, [0, 1, 2, 3, 4]);
    // 3 morning + 2 afternoon — morning is 60%, both above 20%
    expect(dist.balanced).toBe(true);
  });
});

// ── sessionAllocator — getSessionName / getSessionColor ──────────────────────

describe("sessionAllocator — display utilities", () => {
  test("getSessionName capitalizes first letter only", () => {
    expect(getSessionName(TimetableSession.MORNING)).toBe("Morning");
    expect(getSessionName(TimetableSession.AFTERNOON)).toBe("Afternoon");
    expect(getSessionName(TimetableSession.EVENING)).toBe("Evening");
  });

  test("getSessionColor returns a non-empty hex/CSS string for each session", () => {
    const morning = getSessionColor(TimetableSession.MORNING);
    const afternoon = getSessionColor(TimetableSession.AFTERNOON);
    const evening = getSessionColor(TimetableSession.EVENING);
    expect(morning.length).toBeGreaterThan(0);
    expect(afternoon.length).toBeGreaterThan(0);
    expect(evening.length).toBeGreaterThan(0);
    // All different
    expect(new Set([morning, afternoon, evening]).size).toBe(3);
  });
});

// ── getSubjectDayDistribution ─────────────────────────────────────────────────

describe("getSubjectDayDistribution", () => {
  test("correctly tracks which days each subject is taught", () => {
    const slots = [
      { subjectId: "s1", dayOfWeek: 0, period: 1 },
      { subjectId: "s1", dayOfWeek: 1, period: 1 },
      { subjectId: "s1", dayOfWeek: 2, period: 1 },
      { subjectId: "s2", dayOfWeek: 0, period: 2 },
    ];
    const dist = getSubjectDayDistribution(slots);
    expect(dist.get("s1")).toEqual(new Set([0, 1, 2]));
    expect(dist.get("s2")).toEqual(new Set([0]));
  });

  test("counts each day only once even with duplicate slots", () => {
    const slots = [
      { subjectId: "s1", dayOfWeek: 0, period: 1 },
      { subjectId: "s1", dayOfWeek: 0, period: 2 }, // same day
    ];
    const dist = getSubjectDayDistribution(slots);
    expect(dist.get("s1")?.size).toBe(1);
  });
});
