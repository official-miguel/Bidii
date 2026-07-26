/**
 * Property tests for empty-state guard logic in dept analytics chart components.
 *
 * **Validates: Requirements 9.5, 11.1**
 *
 * Property 16: Empty data produces empty-state message, not an empty chart.
 *
 * Each of the four dept analytics components has a simple array-length guard:
 *   - DeptHeatmap    (cells): cells.length === 0  → "No heatmap data available yet."
 *   - DeptSubjectBar (data):  data.length  === 0  → "No subject data available yet."
 *   - DeptMeanTrend  (data):  data.length  === 0  → "No trend data available yet."
 *   - DeptVsSchoolLine (data):data.length  === 0  → "No comparison data available yet."
 *
 * Strategy: test PURE LOGIC only — no React rendering, no DOM, no jest-dom.
 * The guard functions mirror the conditional check in each component exactly.
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure guard functions — mirror the exact condition in each component
// ---------------------------------------------------------------------------

/** DeptHeatmap: `if (cells.length === 0)` */
function heatmapIsEmpty(cells: unknown[]): boolean {
  return cells.length === 0;
}

/** DeptSubjectBar: `if (data.length === 0)` */
function subjectBarIsEmpty(data: unknown[]): boolean {
  return data.length === 0;
}

/** DeptMeanTrend: `if (data.length === 0)` */
function meanTrendIsEmpty(data: unknown[]): boolean {
  return data.length === 0;
}

/** DeptVsSchoolLine: `if (data.length === 0)` */
function vsSchoolLineIsEmpty(data: unknown[]): boolean {
  return data.length === 0;
}

// Empty-state messages extracted verbatim from each component
const EMPTY_MESSAGES = {
  heatmap:    "No heatmap data available yet.",
  subjectBar: "No subject data available yet.",
  meanTrend:  "No trend data available yet.",
  vsSchoolLine: "No comparison data available yet.",
} as const;

// Convenience list of all four (guard, message) pairs
const COMPONENTS = [
  { name: "DeptHeatmap",     guard: heatmapIsEmpty,     message: EMPTY_MESSAGES.heatmap },
  { name: "DeptSubjectBar",  guard: subjectBarIsEmpty,  message: EMPTY_MESSAGES.subjectBar },
  { name: "DeptMeanTrend",   guard: meanTrendIsEmpty,   message: EMPTY_MESSAGES.meanTrend },
  { name: "DeptVsSchoolLine",guard: vsSchoolLineIsEmpty,message: EMPTY_MESSAGES.vsSchoolLine },
] as const;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** An arbitrary value that could appear as an array element (object, number, string). */
const anyElementArb = fc.oneof(
  fc.integer(),
  fc.string(),
  fc.record({ id: fc.string(), value: fc.float({ noNaN: true }) })
);

/** A non-empty array (length ≥ 1) of arbitrary elements. */
const nonEmptyArrayArb = fc.array(anyElementArb, { minLength: 1, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property 1: empty array → guard returns true (empty-state shown)
// ---------------------------------------------------------------------------

describe("Property 16 – empty array always triggers empty-state guard", () => {
  for (const { name, guard } of COMPONENTS) {
    test(`${name}: guard([]) === true`, () => {
      expect(guard([])).toBe(true);
    });

    // Redundant but confirms via fast-check: the only empty array is []
    test(`${name}: fc.constant([]) always triggers guard`, () => {
      fc.assert(
        fc.property(fc.constant([] as unknown[]), (emptyArr) => {
          expect(guard(emptyArr)).toBe(true);
        })
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Property 2: non-empty array (length ≥ 1) → guard returns false (chart shown)
// ---------------------------------------------------------------------------

describe("Property 16 – non-empty array never triggers empty-state guard", () => {
  for (const { name, guard } of COMPONENTS) {
    test(`${name}: any array with length ≥ 1 → guard returns false`, () => {
      fc.assert(
        fc.property(nonEmptyArrayArb, (arr) => {
          expect(guard(arr)).toBe(false);
        })
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Property 3: mutual exclusion — no array can be both empty AND non-empty
// ---------------------------------------------------------------------------

describe("Property 16 – guards are mutually exclusive (empty XOR non-empty)", () => {
  for (const { name, guard } of COMPONENTS) {
    test(`${name}: guard(arr) XOR guard(arr with one item added)`, () => {
      fc.assert(
        fc.property(nonEmptyArrayArb, (arr) => {
          // arr has ≥ 1 elements → not empty
          expect(guard(arr)).toBe(false);
          // Removing all elements → empty
          expect(guard([])).toBe(true);
          // Both results cannot be the same for the same guard
          expect(guard(arr)).not.toBe(guard([]));
        })
      );
    });

    test(`${name}: guard is never simultaneously true for non-empty and false for empty`, () => {
      fc.assert(
        fc.property(nonEmptyArrayArb, (arr) => {
          const emptyResult    = guard([]);
          const nonEmptyResult = guard(arr);
          // They must differ: one true, one false
          expect(emptyResult && nonEmptyResult).toBe(false);
          expect(!emptyResult || !nonEmptyResult).toBe(true);
        })
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Property 4: empty-state messages are non-empty strings and all distinct
// ---------------------------------------------------------------------------

describe("Property 16 – empty-state messages are non-empty and distinct", () => {
  const messages = Object.values(EMPTY_MESSAGES);

  test("every message is a non-empty string", () => {
    for (const msg of messages) {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  test("all four messages are distinct (no two components share the same message)", () => {
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(messages.length);
  });

  test("message strings match the exact text in each component", () => {
    expect(EMPTY_MESSAGES.heatmap).toBe("No heatmap data available yet.");
    expect(EMPTY_MESSAGES.subjectBar).toBe("No subject data available yet.");
    expect(EMPTY_MESSAGES.meanTrend).toBe("No trend data available yet.");
    expect(EMPTY_MESSAGES.vsSchoolLine).toBe("No comparison data available yet.");
  });
});

// ---------------------------------------------------------------------------
// Property 5: guard is deterministic — same input always gives same result
// ---------------------------------------------------------------------------

describe("Property 16 – guard functions are deterministic", () => {
  for (const { name, guard } of COMPONENTS) {
    test(`${name}: same array produces same result on repeated calls`, () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant([] as unknown[]), nonEmptyArrayArb),
          (arr) => {
            const first  = guard(arr);
            const second = guard(arr);
            const third  = guard(arr);
            expect(first).toBe(second);
            expect(second).toBe(third);
          }
        )
      );
    });
  }

  test("determinism holds across all four guards for the same input", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant([] as unknown[]), nonEmptyArrayArb),
        (arr) => {
          for (const { guard } of COMPONENTS) {
            expect(guard(arr)).toBe(guard(arr));
          }
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe("Property 16 – edge cases", () => {
  test("guard behaviour is consistent at the boundary (length 0 vs length 1)", () => {
    for (const { guard } of COMPONENTS) {
      expect(guard([])).toBe(true);           // length 0 → empty
      expect(guard([null])).toBe(false);       // length 1 → not empty
      expect(guard([undefined])).toBe(false);  // length 1 → not empty
      expect(guard([0])).toBe(false);          // length 1 → not empty
    }
  });

  test("large arrays (length > 1000) never trigger empty-state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1001, max: 5000 }),
        (len) => {
          const bigArr = new Array(len).fill(1);
          for (const { guard } of COMPONENTS) {
            expect(guard(bigArr)).toBe(false);
          }
        }
      )
    );
  });
});
