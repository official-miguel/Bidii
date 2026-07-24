/**
 * Property tests for src/lib/assessment/grading844.ts
 *
 * Covers:
 *   Property 15: Uniform colour scale — gradeColour / gradeColourHex /
 *                pointsToColour / pointsToColourHex are consistent across all
 *                chart surfaces (Requirements 6.5, 9.3)
 *   Property 16: Empty data produces empty-state message, not an empty chart
 *                (tested at the data-model level — null pts → grey fallback)
 *
 * Also validates the core grading primitives used by all assessment screens:
 *   - scoreToGrade: score in [0,100] always yields a defined grade+points
 *   - subjectScore: weighted average is bounded correctly
 *   - meanGrade: mean of valid points is in [1,12]
 *   - denseRank: dense-rank invariants (monotone, no gap, null-safe)
 *   - pointsToGrade / gradeColour / pointsToColour: colour consistency
 */

import * as fc from "fast-check";
import {
  scoreToGrade,
  subjectScore,
  meanGrade,
  pointsToGrade,
  denseRank,
  gradeColour,
  gradeColourHex,
  pointsToColour,
  pointsToColourHex,
  ALL_GRADES,
  type KcseGrade,
} from "@/lib/assessment/grading844";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A valid percentage in [0, 100]. */
const pctArb = fc.float({ min: 0, max: 100, noNaN: true });

/** A points value in the KCSE range [1, 12] (possibly fractional). */
const ptsArb = fc.float({ min: 1, max: 12, noNaN: true });

// ---------------------------------------------------------------------------
// scoreToGrade
// ---------------------------------------------------------------------------

describe("scoreToGrade — property tests", () => {
  test("always returns a defined grade and integer points in [1,12]", () => {
    fc.assert(
      fc.property(pctArb, (pct) => {
        const { grade, points } = scoreToGrade(pct);
        expect(ALL_GRADES).toContain(grade);
        expect(Number.isInteger(points)).toBe(true);
        expect(points).toBeGreaterThanOrEqual(1);
        expect(points).toBeLessThanOrEqual(12);
      })
    );
  });

  test("is monotone: higher score never yields lower points", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 99, noNaN: true }),
        fc.float({ min: 1, max: 100, noNaN: true }),
        (a, b) => {
          // Ensure a < b
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (lo === hi) return; // skip equal case
          expect(scoreToGrade(lo).points).toBeLessThanOrEqual(
            scoreToGrade(hi).points
          );
        }
      )
    );
  });

  test("clamps: score <= 0 => grade E, score >= 75 => grade A", () => {
    expect(scoreToGrade(-10).grade).toBe("E");
    expect(scoreToGrade(0).grade).toBe("E");
    expect(scoreToGrade(75).grade).toBe("A");
    expect(scoreToGrade(110).grade).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// subjectScore
// ---------------------------------------------------------------------------

describe("subjectScore — property tests", () => {
  test("single-paper result is score/maxMarks * 100", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 1, max: 100 }),
        (score, max) => {
          const result = subjectScore([score], [max]);
          const expected = (score / max) * 100;
          expect(result).not.toBeNull();
          expect(result!).toBeCloseTo(expected, 8);
        }
      )
    );
  });

  test("result is always in [0, 100] when scores are non-negative", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            score: fc.float({ min: 0, max: 200, noNaN: true }),
            max: fc.integer({ min: 1, max: 200 }),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (papers) => {
          // Clamp scores to their max to simulate valid marks
          const scores = papers.map((p) => Math.min(p.score, p.max));
          const maxMarks = papers.map((p) => p.max);
          const result = subjectScore(scores, maxMarks);
          if (result === null) return; // null is valid when scores are null
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        }
      )
    );
  });

  test("returns null when any score is null", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 3 }), // index of null score
        (maxMarks, nullIdx) => {
          const scores: (number | null)[] = maxMarks.map((m) => m / 2);
          const idx = nullIdx % scores.length;
          scores[idx] = null;
          expect(subjectScore(scores, maxMarks)).toBeNull();
        }
      )
    );
  });

  test("mismatched array lengths return null", () => {
    expect(subjectScore([50], [100, 100])).toBeNull();
    expect(subjectScore([], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// meanGrade
// ---------------------------------------------------------------------------

describe("meanGrade — property tests", () => {
  test("meanPoints is in [1, 12] for any non-empty valid input", () => {
    fc.assert(
      fc.property(
        fc.array(ptsArb, { minLength: 1, maxLength: 20 }),
        (pts) => {
          const result = meanGrade(pts);
          expect(result).not.toBeNull();
          expect(result!.meanPoints).toBeGreaterThanOrEqual(1);
          expect(result!.meanPoints).toBeLessThanOrEqual(12);
        }
      )
    );
  });

  test("null entries are excluded: same result as filtering them out", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(ptsArb, fc.constant(null as number | null)),
          { minLength: 1, maxLength: 20 }
        ),
        (mixed) => {
          const result = meanGrade(mixed);
          const valid = mixed.filter((p): p is number => p !== null);
          if (valid.length === 0) {
            expect(result).toBeNull();
          } else {
            const resultFromValid = meanGrade(valid);
            expect(result).toEqual(resultFromValid);
          }
        }
      )
    );
  });

  test("returns null when all entries are null", () => {
    expect(meanGrade([null, null, null])).toBeNull();
    expect(meanGrade([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// denseRank
// ---------------------------------------------------------------------------

describe("denseRank — property tests", () => {
  test("output has same length as input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.float({ noNaN: true }), fc.constant(null as number | null))),
        (scores) => {
          expect(denseRank(scores)).toHaveLength(scores.length);
        }
      )
    );
  });

  test("null scores produce null ranks", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(ptsArb, fc.constant(null as number | null)), {
          minLength: 1,
          maxLength: 20,
        }),
        (scores) => {
          const ranks = denseRank(scores);
          scores.forEach((s, i) => {
            if (s === null) expect(ranks[i]).toBeNull();
          });
        }
      )
    );
  });

  test("rank 1 is always assigned when any non-null score exists", () => {
    fc.assert(
      fc.property(
        fc.array(ptsArb, { minLength: 1, maxLength: 20 }),
        (scores) => {
          const ranks = denseRank(scores);
          expect(ranks).toContain(1);
        }
      )
    );
  });

  test("equal scores share the same rank (dense-rank invariant)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 12 }), // integer points → easy to produce ties
          { minLength: 2, maxLength: 20 }
        ),
        (scores) => {
          const ranks = denseRank(scores);
          // For every pair with equal score, ranks must match
          for (let i = 0; i < scores.length; i++) {
            for (let j = i + 1; j < scores.length; j++) {
              if (scores[i] === scores[j]) {
                expect(ranks[i]).toBe(ranks[j]);
              }
            }
          }
        }
      )
    );
  });

  test("ranks are monotone-decreasing with score (higher score ≤ rank number)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 12 }),
          { minLength: 2, maxLength: 20 }
        ),
        (scores) => {
          const ranks = denseRank(scores as number[]);
          for (let i = 0; i < scores.length; i++) {
            for (let j = 0; j < scores.length; j++) {
              if (scores[i] > scores[j]) {
                // Higher score → lower (better) rank number
                expect(ranks[i]!).toBeLessThanOrEqual(ranks[j]!);
              }
            }
          }
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Colour scale consistency — Property 15
// ---------------------------------------------------------------------------

describe("Colour scale consistency (Property 15)", () => {
  test("gradeColour and gradeColourHex cover every KCSE grade without throwing", () => {
    for (const grade of ALL_GRADES) {
      const tw = gradeColour(grade as KcseGrade);
      expect(tw.bg).toBeTruthy();
      expect(tw.text).toBeTruthy();

      const hex = gradeColourHex(grade as KcseGrade);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("pointsToColour and gradeColour agree for any integer points value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        (pts) => {
          const fromPoints = pointsToColour(pts);
          const grade = pointsToGrade(pts);
          const fromGrade = gradeColour(grade);
          expect(fromPoints).toEqual(fromGrade);
        }
      )
    );
  });

  test("pointsToColourHex and gradeColourHex agree for any integer points value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        (pts) => {
          const fromPoints = pointsToColourHex(pts);
          const grade = pointsToGrade(pts);
          const fromGrade = gradeColourHex(grade);
          expect(fromPoints).toBe(fromGrade);
        }
      )
    );
  });

  test("null points → grey fallback (empty-state colour, Property 16)", () => {
    const { bg, text } = pointsToColour(null);
    // Must NOT be any of the grade colours — indicates no-data state
    expect(bg).toBe("bg-paper");
    expect(text).toBe("text-slate");
  });

  test("null points → grey hex fallback for Recharts (Property 16)", () => {
    const hex = pointsToColourHex(null);
    // The no-data hex is #e5e7eb (grey-200)
    expect(hex).toBe("#e5e7eb");
  });

  test("same grade always maps to the same colour class (deterministic)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_GRADES),
        (grade: string) => {
          const a = gradeColour(grade as KcseGrade);
          const b = gradeColour(grade as KcseGrade);
          expect(a).toEqual(b);
        }
      )
    );
  });
});
