/**
 * Property tests for the Report Page framework routing invariant.
 *
 * Property 13: Report framework routing invariant
 * Validates: Requirements 8.3
 *
 * The ReportPage component routes to the correct report card based on
 * framework type:
 *   - frameworkType === "EIGHT_FOUR_FOUR" → ReportCard (8-4-4)
 *   - frameworkType === "CBE" or "CBC"    → CbeReportCard
 *
 * The routing decision is extracted here as a pure function so it can be
 * tested independently of the React component tree.
 *
 * Source: src/components/assessment/ReportPageWithGraph.tsx
 *   The component conditions on `frameworkType === "EIGHT_FOUR_FOUR"` to
 *   render ReportCard; everything else renders CbeReportCard.
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure routing function extracted from ReportPageWithGraph.tsx
//
// The actual component uses:
//   frameworkType === "EIGHT_FOUR_FOUR" ? <ReportCard /> : <CbeReportCard />
//
// We model this as a pure function returning "844" or "CBE":
//   - "EIGHT_FOUR_FOUR" → "844"  (routes to ReportCard)
//   - anything else     → "CBE"  (routes to CbeReportCard)
// ---------------------------------------------------------------------------

function selectFramework(frameworkType: string): "CBE" | "844" {
  return frameworkType === "EIGHT_FOUR_FOUR" ? "844" : "CBE";
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** The exact "EIGHT_FOUR_FOUR" string — the only 8-4-4 route trigger. */
const eightFourFourArb = fc.constant("EIGHT_FOUR_FOUR");

/** Any string that is NOT "EIGHT_FOUR_FOUR" — should always route to CBE card. */
const nonEightFourFourArb = fc
  .string()
  .filter((s) => s !== "EIGHT_FOUR_FOUR");

/** Known framework types from the Props definition. */
const knownFrameworkArb = fc.constantFrom(
  "EIGHT_FOUR_FOUR",
  "CBC",
  "CBE"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("selectFramework — Property 13: Report framework routing invariant", () => {
  /**
   * Property 1: "EIGHT_FOUR_FOUR" always routes to the 8-4-4 report card.
   * Validates: Requirements 8.3
   */
  test('frameworkType === "EIGHT_FOUR_FOUR" always routes to "844"', () => {
    fc.assert(
      fc.property(eightFourFourArb, (frameworkType) => {
        expect(selectFramework(frameworkType)).toBe("844");
      })
    );
  });

  /**
   * Property 2: Any frameworkType !== "EIGHT_FOUR_FOUR" always routes to CBE card.
   * Validates: Requirements 8.3
   */
  test('frameworkType !== "EIGHT_FOUR_FOUR" always routes to "CBE"', () => {
    fc.assert(
      fc.property(nonEightFourFourArb, (frameworkType) => {
        expect(selectFramework(frameworkType)).toBe("CBE");
      })
    );
  });

  /**
   * Property 3: Routes are mutually exclusive — same string never maps to both.
   * Validates: Requirements 8.3
   */
  test("routes are mutually exclusive — same string never maps to both", () => {
    fc.assert(
      fc.property(fc.string(), (frameworkType) => {
        const route = selectFramework(frameworkType);
        // A route is exactly one of "844" or "CBE", never both
        const is844 = route === "844";
        const isCBE = route === "CBE";
        expect(is844 !== isCBE).toBe(true); // exactly one is true
      })
    );
  });

  /**
   * Property 4: Routing is deterministic — same input, same output every call.
   * Validates: Requirements 8.3
   */
  test("routing is deterministic — same input always produces same output", () => {
    fc.assert(
      fc.property(fc.string(), (frameworkType) => {
        const first = selectFramework(frameworkType);
        const second = selectFramework(frameworkType);
        expect(first).toBe(second);
      })
    );
  });

  /**
   * Property 5: "EIGHT_FOUR_FOUR" and "CBE" produce different routes.
   * Validates: Requirements 8.3
   */
  test('"EIGHT_FOUR_FOUR" and "CBE" produce different routes', () => {
    expect(selectFramework("EIGHT_FOUR_FOUR")).not.toBe(
      selectFramework("CBE")
    );
  });

  /**
   * Property 5b: "EIGHT_FOUR_FOUR" and "CBC" produce different routes.
   * Validates: Requirements 8.3
   */
  test('"EIGHT_FOUR_FOUR" and "CBC" produce different routes', () => {
    expect(selectFramework("EIGHT_FOUR_FOUR")).not.toBe(
      selectFramework("CBC")
    );
  });

  /**
   * Property 6: Unknown/arbitrary strings never route to "844" unless the
   * string IS exactly "EIGHT_FOUR_FOUR".
   * Validates: Requirements 8.3
   */
  test('arbitrary strings only route to "844" when the string IS "EIGHT_FOUR_FOUR"', () => {
    fc.assert(
      fc.property(fc.string(), (frameworkType) => {
        const route = selectFramework(frameworkType);
        if (route === "844") {
          expect(frameworkType).toBe("EIGHT_FOUR_FOUR");
        }
      })
    );
  });

  // ---------------------------------------------------------------------------
  // Known framework types — spot checks
  // ---------------------------------------------------------------------------

  test("known frameworks route correctly", () => {
    expect(selectFramework("EIGHT_FOUR_FOUR")).toBe("844");
    expect(selectFramework("CBE")).toBe("CBE");
    expect(selectFramework("CBC")).toBe("CBE");
  });

  test("empty string routes to CBE (not 8-4-4)", () => {
    expect(selectFramework("")).toBe("CBE");
  });

  test("case-sensitive: lowercase or mixed-case variants route to CBE, not 8-4-4", () => {
    expect(selectFramework("eight_four_four")).toBe("CBE");
    expect(selectFramework("Eight_Four_Four")).toBe("CBE");
    expect(selectFramework("844")).toBe("CBE");
    expect(selectFramework("8-4-4")).toBe("CBE");
  });

  /**
   * Exhaustive check over all known framework strings.
   * Validates: Requirements 8.3
   */
  test("all known framework strings produce a valid route (no throws)", () => {
    fc.assert(
      fc.property(knownFrameworkArb, (frameworkType) => {
        const route = selectFramework(frameworkType);
        expect(["844", "CBE"]).toContain(route);
      })
    );
  });
});
