/**
 * Tests for src/lib/timetable/streamBalancer.ts
 *
 * Covers:
 *   - analyzeStreamBalance: detects and reports imbalances
 *   - suggestStreamAssignments: distributes students fairly
 *   - calculateRebalancingMoves: identifies moves to achieve balance
 */

import * as fc from "fast-check";
import {
  analyzeStreamBalance,
  suggestStreamAssignments,
  calculateRebalancingMoves,
  type StreamOption,
  type StreamStudent,
  type BalancingConfig,
} from "@/lib/timetable/streamBalancer";

const CONFIG: BalancingConfig = {
  maxAbsoluteDifference: 5,
  maxPercentageDifference: 0.2,
  minStreamSize: 10,
  maxStreamSize: 50,
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStream(id: string, count: number): StreamOption {
  return {
    classId: id,
    className: `Class ${id}`,
    stream: id,
    currentCount: count,
    capacity: 50,
  };
}

function makeStudents(count: number, classId: string): StreamStudent[] {
  return Array.from({ length: count }, (_, i) => ({
    studentId: `${classId}-s${i}`,
    name: `Student ${i}`,
    currentClassId: classId,
    currentClassName: `Class ${classId}`,
  }));
}

// ── analyzeStreamBalance ──────────────────────────────────────────────────────

describe("analyzeStreamBalance", () => {
  const subject = { id: "subj1", code: "BIO", name: "Biology" };

  test("balanced streams produce no warnings", () => {
    const streams = [makeStream("A", 25), makeStream("B", 25)];
    const students = [...makeStudents(25, "A"), ...makeStudents(25, "B")];

    const result = analyzeStreamBalance(subject, streams, students, CONFIG);
    expect(result.balanced).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.requiresApproval).toBe(false);
  });

  test("large difference triggers imbalance warning", () => {
    const streams = [makeStream("A", 40), makeStream("B", 10)];
    const students = [...makeStudents(40, "A"), ...makeStudents(10, "B")];

    const result = analyzeStreamBalance(subject, streams, students, CONFIG);
    expect(result.balanced).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("requires approval when difference exceeds threshold", () => {
    const streams = [makeStream("A", 45), makeStream("B", 5)];
    const students = [...makeStudents(45, "A"), ...makeStudents(5, "B")];

    const result = analyzeStreamBalance(subject, streams, students, CONFIG);
    expect(result.requiresApproval).toBe(true);
  });

  test("empty streams returns balanced result", () => {
    const result = analyzeStreamBalance(subject, [], [], CONFIG);
    expect(result.balanced).toBe(true);
    expect(result.streams).toHaveLength(0);
  });

  test("single stream is always balanced", () => {
    const streams = [makeStream("A", 30)];
    const students = makeStudents(30, "A");

    const result = analyzeStreamBalance(subject, streams, students, CONFIG);
    expect(result.balanced).toBe(true);
  });

  test("stream below minimum size triggers approval", () => {
    const streams = [makeStream("A", 25), makeStream("B", 5)]; // B below min=10
    const students = [...makeStudents(25, "A"), ...makeStudents(5, "B")];

    const result = analyzeStreamBalance(subject, streams, students, CONFIG);
    expect(result.requiresApproval).toBe(true);
    expect(result.warnings.some((w) => w.includes("5 students"))).toBe(true);
  });
});

// ── suggestStreamAssignments ──────────────────────────────────────────────────

describe("suggestStreamAssignments", () => {
  test("distributes students across streams evenly", () => {
    const streams = [makeStream("A", 0), makeStream("B", 0)];
    const students = makeStudents(10, "tmp");

    const assignments = suggestStreamAssignments(students, streams, CONFIG);
    expect(assignments.size).toBe(10);

    // Count per stream
    const countA = [...assignments.values()].filter((v) => v === "A").length;
    const countB = [...assignments.values()].filter((v) => v === "B").length;
    expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1);
  });

  test("assigns all students when streams have capacity", () => {
    const streams = [makeStream("A", 0), makeStream("B", 0), makeStream("C", 0)];
    const students = makeStudents(12, "tmp");

    const assignments = suggestStreamAssignments(students, streams, CONFIG);
    expect(assignments.size).toBe(students.length);
  });

  test("returns empty assignments for empty inputs", () => {
    const assignments = suggestStreamAssignments([], [], CONFIG);
    expect(assignments.size).toBe(0);
  });

  test("respects stream capacity", () => {
    const streams = [
      { classId: "A", className: "A", stream: "A", currentCount: 0, capacity: 3 },
      { classId: "B", className: "B", stream: "B", currentCount: 0, capacity: 50 },
    ];
    const students = makeStudents(10, "tmp");

    const assignments = suggestStreamAssignments(students, streams, CONFIG);
    const countA = [...assignments.values()].filter((v) => v === "A").length;
    expect(countA).toBeLessThanOrEqual(3);
  });

  test("property: every assigned student gets a valid stream", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 3 }),
        (studentCount, streamCount) => {
          const streams = Array.from({ length: streamCount }, (_, i) =>
            makeStream(String(i), 0)
          );
          const students = makeStudents(studentCount, "tmp");

          const assignments = suggestStreamAssignments(students, streams, CONFIG);
          const streamIds = new Set(streams.map((s) => s.classId));

          for (const [, classId] of assignments) {
            expect(streamIds.has(classId)).toBe(true);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ── calculateRebalancingMoves ─────────────────────────────────────────────────

describe("calculateRebalancingMoves", () => {
  test("no moves needed when already balanced", () => {
    const streams = [makeStream("A", 20), makeStream("B", 20)];
    const students = [
      ...makeStudents(20, "A"),
      ...makeStudents(20, "B"),
    ];

    const currentAssignments = new Map<string, string>();
    for (const s of students) {
      currentAssignments.set(s.studentId, s.currentClassId);
    }

    const moves = calculateRebalancingMoves(currentAssignments, students, streams, CONFIG);
    expect(moves.length).toBe(0);
  });

  test("generates moves to balance unequal streams", () => {
    const streams = [makeStream("A", 30), makeStream("B", 10)];
    const studentsA = makeStudents(30, "A");
    const studentsB = makeStudents(10, "B");
    const allStudents = [...studentsA, ...studentsB];

    const currentAssignments = new Map<string, string>();
    for (const s of allStudents) {
      currentAssignments.set(s.studentId, s.currentClassId);
    }

    const moves = calculateRebalancingMoves(currentAssignments, allStudents, streams, CONFIG);
    // Should suggest moving students from A (30) to B (10) to get to 20/20
    expect(moves.length).toBeGreaterThan(0);
    // All moves should go from A to B
    for (const move of moves) {
      expect(move.fromClassId).toBe("A");
      expect(move.toClassId).toBe("B");
    }
  });

  test("returns empty moves for empty inputs", () => {
    const moves = calculateRebalancingMoves(new Map(), [], [], CONFIG);
    expect(moves.length).toBe(0);
  });
});
