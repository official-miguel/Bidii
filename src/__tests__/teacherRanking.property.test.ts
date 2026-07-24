/**
 * Property tests for teacher ranking pure helpers.
 *
 * Covers:
 *   Property 11: Composite score formula correctness (Requirement 7.1)
 *   Property 12: Ranking trend direction is monotone consistent (Requirement 7.7)
 *
 * These tests operate purely on the extracted helper functions:
 *   - computeCompositeScore
 *   - deriveTrendDirection
 *   - normalise
 *   - DEFAULT_WEIGHTS
 *
 * No DB, no Prisma, no network.
 */

import * as fc from "fast-check";
import {
  computeCompositeScore,
  deriveTrendDirection,
  normalise,
  DEFAULT_WEIGHTS,
  type RankingWeights,
} from "@/lib/assessment/teacherRanking";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A normalised value in [0, 1]. */
const normArb = fc.float({ min: 0, max: 1, noNaN: true });

/** Three weights that sum to exactly 1.0 (the DB CHECK constraint). */
const weightsArb: fc.Arbitrary<RankingWeights> = fc
  .tuple(
    fc.float({ min: 0.01, max: 0.98, noNaN: true }),
    fc.float({ min: 0.01, max: 0.98, noNaN: true })
  )
  .map(([a, b]) => {
    // Force the three values to sum to 1
    const w1 = Math.min(a, 1 - 0.01 - 0.01);
    const w2 = Math.min(b, 1 - w1 - 0.01);
    const w3 = 1 - w1 - w2;
    return {
      improvementWeight: w1,
      completionWeight: w2,
      absoluteWeight: w3,
    } satisfies RankingWeights;
  });

// ---------------------------------------------------------------------------
// Property 11 — composite score formula correctness
// ---------------------------------------------------------------------------

describe("computeCompositeScore — Property 11", () => {
  test("result is in [0, 1] when all inputs are in [0, 1] and weights sum to 1", () => {
    fc.assert(
      fc.property(normArb, normArb, normArb, weightsArb, (ni, cs, na, w) => {
        const score = computeCompositeScore(ni, cs, na, w);
        expect(score).toBeGreaterThanOrEqual(-1e-9); // allow tiny float error
        expect(score).toBeLessThanOrEqual(1 + 1e-9);
      })
    );
  });

  test("matches the hand-written formula exactly", () => {
    fc.assert(
      fc.property(normArb, normArb, normArb, weightsArb, (ni, cs, na, w) => {
        const expected =
          w.improvementWeight * ni +
          w.completionWeight * cs +
          w.absoluteWeight * na;
        const actual = computeCompositeScore(ni, cs, na, w);
        expect(actual).toBeCloseTo(expected, 10);
      })
    );
  });

  test("is additive: score(w1) + score(w2) = score(w1+w2) when inputs fixed", () => {
    // Linearity check: composite is a linear combination → additive in weights
    fc.assert(
      fc.property(
        normArb,
        normArb,
        normArb,
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        (ni, cs, na, wi, wc, wa) => {
          const w: RankingWeights = {
            improvementWeight: wi,
            completionWeight: wc,
            absoluteWeight: wa,
          };
          // Scale = sum of weights (may not equal 1, that's fine for linearity)
          const scale = wi + wc + wa;
          if (scale === 0) return;

          // Double all weights → score should double
          const wDouble: RankingWeights = {
            improvementWeight: wi * 2,
            completionWeight: wc * 2,
            absoluteWeight: wa * 2,
          };
          const single = computeCompositeScore(ni, cs, na, w);
          const doubled = computeCompositeScore(ni, cs, na, wDouble);
          expect(doubled).toBeCloseTo(single * 2, 10);
        }
      )
    );
  });

  test("default weights sum to 1.0 (DB CHECK constraint)", () => {
    const sum =
      DEFAULT_WEIGHTS.improvementWeight +
      DEFAULT_WEIGHTS.completionWeight +
      DEFAULT_WEIGHTS.absoluteWeight;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  test("zero inputs yield zero score regardless of weights", () => {
    fc.assert(
      fc.property(weightsArb, (w) => {
        expect(computeCompositeScore(0, 0, 0, w)).toBe(0);
      })
    );
  });

  test("all-ones inputs yield exactly the sum of weights (= 1 when they sum to 1)", () => {
    fc.assert(
      fc.property(weightsArb, (w) => {
        const score = computeCompositeScore(1, 1, 1, w);
        const weightSum =
          w.improvementWeight + w.completionWeight + w.absoluteWeight;
        expect(score).toBeCloseTo(weightSum, 10);
      })
    );
  });

  test("higher improvement score never lowers composite score (monotone in ni)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 0.99, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        normArb,
        normArb,
        weightsArb,
        (niLo, delta, cs, na, w) => {
          const niHi = Math.min(niLo + delta, 1);
          const lo = computeCompositeScore(niLo, cs, na, w);
          const hi = computeCompositeScore(niHi, cs, na, w);
          expect(hi).toBeGreaterThanOrEqual(lo - 1e-9);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 — trend direction monotone consistency
// ---------------------------------------------------------------------------

describe("deriveTrendDirection — Property 12", () => {
  test("positive improvement > 0.05 always returns +1", () => {
    fc.assert(
      fc.property(fc.float({ min: 0.051, max: 10, noNaN: true }), (impr) => {
        expect(deriveTrendDirection(impr)).toBe(1);
      })
    );
  });

  test("negative improvement < -0.05 always returns -1", () => {
    fc.assert(
      fc.property(fc.float({ min: 0.051, max: 10, noNaN: true }), (mag) => {
        expect(deriveTrendDirection(-mag)).toBe(-1);
      })
    );
  });

  test("improvement in [-0.05, +0.05] returns 0 (stable band)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -0.05, max: 0.05, noNaN: true }),
        (impr) => {
          expect(deriveTrendDirection(impr)).toBe(0);
        }
      )
    );
  });

  test("null improvement always returns 0 (no previous period)", () => {
    expect(deriveTrendDirection(null)).toBe(0);
  });

  test("is monotone: if a > b then direction(a) >= direction(b)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -5, max: 5, noNaN: true }),
        fc.float({ min: -5, max: 5, noNaN: true }),
        (a, b) => {
          const hi = Math.max(a, b);
          const lo = Math.min(a, b);
          expect(deriveTrendDirection(hi)).toBeGreaterThanOrEqual(
            deriveTrendDirection(lo)
          );
        }
      )
    );
  });

  test("return value is always one of -1, 0, +1", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.float({ noNaN: true }), fc.constant(null as number | null)),
        (impr) => {
          const dir = deriveTrendDirection(impr);
          expect([-1, 0, 1]).toContain(dir);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// normalise helper
// ---------------------------------------------------------------------------

describe("normalise — unit tests", () => {
  test("returns 0 when value equals min", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10, noNaN: true }), (v) => {
        expect(normalise(v, v, v + 1)).toBeCloseTo(0, 10);
      })
    );
  });

  test("returns 1 when value equals max", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10, noNaN: true }), (v) => {
        expect(normalise(v + 1, v, v + 1)).toBeCloseTo(1, 10);
      })
    );
  });

  test("returns 0 when min === max (no-range guard)", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (v) => {
        expect(normalise(v, v, v)).toBe(0);
      })
    );
  });

  test("result is in [0, 1] when value is in [min, max]", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (lo === hi) return;
          const v = (lo + hi) / 2; // midpoint — definitely in range
          const result = normalise(v, lo, hi);
          expect(result).toBeGreaterThanOrEqual(-1e-9);
          expect(result).toBeLessThanOrEqual(1 + 1e-9);
        }
      )
    );
  });
});
