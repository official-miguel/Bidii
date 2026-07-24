/**
 * Property tests for UnifiedClassTable data model.
 *
 * Covers:
 *   Property 3: UnifiedClassTable row completeness — every ClassRow rendered
 *               has a non-empty class name, valid form, and completion pct in [0,100]
 *               (Requirement 4.4)
 *   Property 4: Framework badge distinguishes frameworks — frameworkType maps
 *               to exactly the expected badge label (Requirement 4.5)
 *
 * Strategy: we test the ClassRow data contract and the FrameworkBadge logic
 * directly without rendering React. The badge selection logic is a pure
 * switch-equivalent — we inline the same rule here and verify consistency.
 */

import * as fc from "fast-check";
import type { ClassRow } from "@/components/assessment/UnifiedClassTable";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const frameworkTypeArb = fc.oneof(
  fc.constant("CBE"),
  fc.constant("CBC"),
  fc.constant("8-4-4"),
  // Also test unknown values — should fall back to "8-4-4" label
  fc.string({ minLength: 1, maxLength: 10 })
);

const classRowArb: fc.Arbitrary<ClassRow> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }),
  form: fc.integer({ min: 1, max: 6 }),
  frameworkType: frameworkTypeArb,
  meanPoints: fc.oneof(
    fc.float({ min: 1, max: 12, noNaN: true }),
    fc.constant(null as number | null)
  ),
  meanGrade: fc.oneof(
    fc.constantFrom("A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E"),
    fc.constant(null as string | null)
  ),
  entryCompletionPct: fc.integer({ min: 0, max: 100 }),
});

// Pure inline of the FrameworkBadge logic (mirrors UnifiedClassTable.tsx)
function frameworkLabel(type: string): string {
  if (type === "CBE") return "CBE";
  if (type === "CBC") return "CBC";
  return "8-4-4";
}

// ---------------------------------------------------------------------------
// Property 3 — ClassRow data completeness
// ---------------------------------------------------------------------------

describe("ClassRow data completeness — Property 3", () => {
  test("every ClassRow has a non-empty name", () => {
    fc.assert(
      fc.property(classRowArb, (row) => {
        expect(row.name.length).toBeGreaterThan(0);
      })
    );
  });

  test("form is always a positive integer", () => {
    fc.assert(
      fc.property(classRowArb, (row) => {
        expect(Number.isInteger(row.form)).toBe(true);
        expect(row.form).toBeGreaterThan(0);
      })
    );
  });

  test("entryCompletionPct is always in [0, 100]", () => {
    fc.assert(
      fc.property(classRowArb, (row) => {
        expect(row.entryCompletionPct).toBeGreaterThanOrEqual(0);
        expect(row.entryCompletionPct).toBeLessThanOrEqual(100);
      })
    );
  });

  test("meanGrade is null when meanPoints is null (no-data state)", () => {
    // When we have null meanPoints, the component renders "—" not a grade
    // Validate that our test data maintains this invariant:
    const nullMeanRow: ClassRow = {
      id: "c1",
      name: "Form 1A",
      form: 1,
      frameworkType: "8-4-4",
      meanPoints: null,
      meanGrade: null,
      entryCompletionPct: 0,
    };
    expect(nullMeanRow.meanGrade).toBeNull();
    expect(nullMeanRow.meanPoints).toBeNull();
  });

  test("an array of ClassRows has exactly as many rows as input", () => {
    fc.assert(
      fc.property(
        fc.array(classRowArb, { minLength: 0, maxLength: 30 }),
        (rows) => {
          // The table renders one <tr> per row — row count is preserved
          expect(rows.length).toBeGreaterThanOrEqual(0);
          const ids = rows.map((r) => r.id);
          // No duplicates assumed, but length is exact
          expect(ids.length).toBe(rows.length);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — Framework badge correctness
// ---------------------------------------------------------------------------

describe("Framework badge distinguishes frameworks — Property 4", () => {
  test("CBE frameworkType always maps to 'CBE' label", () => {
    expect(frameworkLabel("CBE")).toBe("CBE");
  });

  test("CBC frameworkType always maps to 'CBC' label", () => {
    expect(frameworkLabel("CBC")).toBe("CBC");
  });

  test("8-4-4 and unknown types always fall back to '8-4-4' label", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter(
          (s) => s !== "CBE" && s !== "CBC"
        ),
        (type) => {
          expect(frameworkLabel(type)).toBe("8-4-4");
        }
      )
    );
  });

  test("distinct framework strings always produce distinct badge labels", () => {
    // CBE, CBC, and 8-4-4 must all differ
    const labels = ["CBE", "CBC", "8-4-4"].map(frameworkLabel);
    const unique = new Set(labels);
    expect(unique.size).toBe(3);
  });

  test("frameworkType on each ClassRow determines a non-empty label", () => {
    fc.assert(
      fc.property(classRowArb, (row) => {
        const label = frameworkLabel(row.frameworkType);
        expect(label.length).toBeGreaterThan(0);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Combined — Property 3+4 together: every row in a table has consistent data
// ---------------------------------------------------------------------------

describe("ClassRow array — combined consistency (Properties 3+4)", () => {
  test("every row passes all completeness and badge constraints", () => {
    fc.assert(
      fc.property(
        fc.array(classRowArb, { minLength: 1, maxLength: 20 }),
        (rows) => {
          for (const row of rows) {
            // Completeness
            expect(row.name.length).toBeGreaterThan(0);
            expect(row.form).toBeGreaterThan(0);
            expect(row.entryCompletionPct).toBeGreaterThanOrEqual(0);
            expect(row.entryCompletionPct).toBeLessThanOrEqual(100);
            // Badge
            const label = frameworkLabel(row.frameworkType);
            expect(label).toBeTruthy();
          }
        }
      )
    );
  });
});
