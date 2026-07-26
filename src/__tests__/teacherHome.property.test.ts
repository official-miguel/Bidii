/**
 * Property tests for teacher home pure helpers.
 *
 * Covers:
 *   Property 1: Teacher home entry count is consistent with the marksheet (Requirements 2.1, 2.3)
 *   Property 2: Teacher home cards match assignments exactly (Requirement 2.1)
 *
 * The two helpers are inlined from the route
 * (src/app/api/assessments/home/teacher/route.ts) so these tests exercise
 * pure data-shaping logic with no DB, no Prisma, no network.
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Inlined types (mirrors TeacherClassCard from the route)
// ---------------------------------------------------------------------------

interface TeacherClassCard {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  frameworkType: string;
  periodId: string | null;
  periodName: string | null;
  totalStudents: number;
  enteredCount: number;
}

// ---------------------------------------------------------------------------
// Inlined helpers (copied verbatim from the route's if (currentPeriod) block)
// ---------------------------------------------------------------------------

/**
 * buildEnteredMap
 *
 * Given raw entry rows (each row has studentId, subjectId, and the student's
 * classId), groups them by "classId:subjectId" and counts distinct studentIds
 * per pair. Mirrors the bucket-building logic in the route.
 */
function buildEnteredMap(
  enteredItems: Array<{ studentId: string; subjectId: string; student: { classId: string } }>
): Map<string, number> {
  const buckets = new Map<string, Set<string>>();
  for (const item of enteredItems) {
    const key = `${item.student.classId}:${item.subjectId}`;
    const set = buckets.get(key) ?? new Set();
    set.add(item.studentId);
    buckets.set(key, set);
  }
  return new Map([...buckets.entries()].map(([k, s]) => [k, s.size]));
}

/**
 * buildCards
 *
 * Maps each assignment to a TeacherClassCard using the student-count map and
 * entered-count map. Mirrors the cards.map() call in the route.
 */
function buildCards(
  assignments: Array<{
    classId: string;
    subjectId: string;
    schoolClass: { id: string; name: string; frameworkType: string };
    subject: { id: string; name: string; code: string };
  }>,
  studentCountByClass: Map<string, number>,
  enteredMap: Map<string, number>,
  currentPeriod: { id: string; name: string } | null
): TeacherClassCard[] {
  return assignments.map((a) => ({
    classId: a.classId,
    className: a.schoolClass.name,
    subjectId: a.subjectId,
    subjectName: a.subject.name,
    subjectCode: a.subject.code,
    frameworkType: a.schoolClass.frameworkType,
    periodId: currentPeriod?.id ?? null,
    periodName: currentPeriod?.name ?? null,
    totalStudents: studentCountByClass.get(a.classId) ?? 0,
    enteredCount: enteredMap.get(`${a.classId}:${a.subjectId}`) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A non-empty lowercase-letter string id (avoids path/key injection). */
const idArb = fc.stringOf(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz0123456789".split(""))), { minLength: 1, maxLength: 12 });

/** A single entry row with a student, subject, and the student's class. */
const entryRowArb = (classId: string, subjectId: string) =>
  idArb.map((studentId) => ({
    studentId,
    subjectId,
    student: { classId },
  }));

/** An assignment object (mirrors classSubjectTeacher DB shape). */
const assignmentArb = fc
  .tuple(idArb, idArb)
  .map(([classId, subjectId]) => ({
    classId,
    subjectId,
    schoolClass: { id: classId, name: `Class-${classId}`, frameworkType: "EIGHT_FOUR_FOUR" },
    subject: { id: subjectId, name: `Subject-${subjectId}`, code: `S-${subjectId}` },
  }));

/** A list of 0–20 assignments with guaranteed-unique (classId, subjectId) pairs. */
const assignmentListArb: fc.Arbitrary<
  Array<{
    classId: string;
    subjectId: string;
    schoolClass: { id: string; name: string; frameworkType: string };
    subject: { id: string; name: string; code: string };
  }>
> = fc
  .array(fc.tuple(idArb, idArb), { minLength: 0, maxLength: 20 })
  .map((pairs) => {
    // Deduplicate by "classId:subjectId" to mirror real DB unique constraint.
    const seen = new Set<string>();
    return pairs
      .filter(([cId, sId]) => {
        const key = `${cId}:${sId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(([classId, subjectId]) => ({
        classId,
        subjectId,
        schoolClass: { id: classId, name: `Class-${classId}`, frameworkType: "EIGHT_FOUR_FOUR" },
        subject: { id: subjectId, name: `Subject-${subjectId}`, code: `S-${subjectId}` },
      }));
  });

// ---------------------------------------------------------------------------
// Property 1: Teacher home entry count is consistent with the marksheet
// Validates: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

describe("buildEnteredMap — Property 1: entry count consistent with marksheet", () => {
  /**
   * enteredCount equals the number of distinct studentId values in the entries
   * for that (classId, subjectId) pair.
   */
  test("enteredCount equals distinct studentId count for each (classId, subjectId) pair", () => {
    fc.assert(
      fc.property(
        idArb,
        idArb,
        fc.array(idArb, { minLength: 1, maxLength: 30 }),
        (classId, subjectId, studentIds) => {
          const rows = studentIds.map((sid) => ({
            studentId: sid,
            subjectId,
            student: { classId },
          }));
          const enteredMap = buildEnteredMap(rows);
          const key = `${classId}:${subjectId}`;
          const expected = new Set(studentIds).size;
          expect(enteredMap.get(key)).toBe(expected);
        }
      )
    );
  });

  /**
   * Duplicate entry rows for the same student are deduplicated → count = 1.
   */
  test("duplicate rows for the same student count as 1, not multiple", () => {
    fc.assert(
      fc.property(
        idArb,
        idArb,
        idArb,
        fc.integer({ min: 2, max: 10 }),
        (classId, subjectId, studentId, duplicates) => {
          const rows = Array.from({ length: duplicates }, () => ({
            studentId,
            subjectId,
            student: { classId },
          }));
          const enteredMap = buildEnteredMap(rows);
          expect(enteredMap.get(`${classId}:${subjectId}`)).toBe(1);
        }
      )
    );
  });

  /**
   * enteredCount is 0 (key absent) when no entries exist.
   */
  test("enteredCount is 0 (key absent) when no entries exist", () => {
    fc.assert(
      fc.property(idArb, idArb, (classId, subjectId) => {
        const enteredMap = buildEnteredMap([]);
        const count = enteredMap.get(`${classId}:${subjectId}`) ?? 0;
        expect(count).toBe(0);
      })
    );
  });

  /**
   * enteredCount never exceeds totalStudents on a card.
   *
   * We generate a set of N students assigned to a class, then produce at most
   * N entry rows (only from those same students). The resulting enteredCount
   * must not exceed totalStudents.
   */
  test("enteredCount never exceeds totalStudents on a card", () => {
    fc.assert(
      fc.property(
        idArb,
        idArb,
        fc.array(idArb, { minLength: 1, maxLength: 20 }),
        (classId, subjectId, allStudentIds) => {
          const uniqueStudents = [...new Set(allStudentIds)];
          const totalStudents = uniqueStudents.length;

          // Generate entries only from the actual student pool (subset).
          const entryStudents = uniqueStudents.slice(
            0,
            Math.floor(uniqueStudents.length / 2) + 1
          );
          const rows = entryStudents.map((sid) => ({
            studentId: sid,
            subjectId,
            student: { classId },
          }));

          const enteredMap = buildEnteredMap(rows);
          const enteredCount = enteredMap.get(`${classId}:${subjectId}`) ?? 0;

          const studentCountByClass = new Map([[classId, totalStudents]]);
          const assignments = [
            {
              classId,
              subjectId,
              schoolClass: { id: classId, name: "C", frameworkType: "EIGHT_FOUR_FOUR" },
              subject: { id: subjectId, name: "S", code: "SC" },
            },
          ];
          const cards = buildCards(
            assignments,
            studentCountByClass,
            enteredMap,
            { id: "p1", name: "Term 1" }
          );

          expect(cards[0].enteredCount).toBeLessThanOrEqual(cards[0].totalStudents);
          expect(enteredCount).toBeLessThanOrEqual(totalStudents);
        }
      )
    );
  });

  /**
   * buildEnteredMap keeps separate counts for different (classId, subjectId) pairs
   * — entries for one pair do not leak into another pair's count.
   */
  test("counts are isolated per (classId, subjectId) key — no cross-contamination", () => {
    fc.assert(
      fc.property(
        idArb,
        idArb,
        idArb,
        idArb,
        fc.array(idArb, { minLength: 1, maxLength: 10 }),
        fc.array(idArb, { minLength: 1, maxLength: 10 }),
        (classA, classB, subjectA, subjectB, studentsA, studentsB) => {
          // Ensure the two pairs differ on at least one dimension.
          if (classA === classB && subjectA === subjectB) return;

          const rows = [
            ...studentsA.map((sid) => ({
              studentId: sid,
              subjectId: subjectA,
              student: { classId: classA },
            })),
            ...studentsB.map((sid) => ({
              studentId: sid,
              subjectId: subjectB,
              student: { classId: classB },
            })),
          ];

          const enteredMap = buildEnteredMap(rows);
          const countA = enteredMap.get(`${classA}:${subjectA}`) ?? 0;
          const countB = enteredMap.get(`${classB}:${subjectB}`) ?? 0;

          expect(countA).toBe(new Set(studentsA).size);
          expect(countB).toBe(new Set(studentsB).size);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Teacher home cards match assignments exactly
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe("buildCards — Property 2: cards match assignments exactly", () => {
  /**
   * Number of cards equals number of assignments (for any length 0–20).
   */
  test("number of cards equals number of assignments", () => {
    fc.assert(
      fc.property(assignmentListArb, (assignments) => {
        const cards = buildCards(
          assignments,
          new Map(),
          new Map(),
          { id: "p1", name: "Term 1" }
        );
        expect(cards.length).toBe(assignments.length);
      })
    );
  });

  /**
   * Zero assignments yields empty cards array.
   */
  test("zero assignments yields empty cards array", () => {
    const cards = buildCards([], new Map(), new Map(), { id: "p1", name: "Term 1" });
    expect(cards).toHaveLength(0);
  });

  /**
   * Each card's (classId, subjectId) corresponds to exactly one assignment.
   */
  test("each card (classId, subjectId) corresponds to exactly one assignment", () => {
    fc.assert(
      fc.property(assignmentListArb, (assignments) => {
        const cards = buildCards(
          assignments,
          new Map(),
          new Map(),
          { id: "p1", name: "Term 1" }
        );
        for (const card of cards) {
          const matching = assignments.filter(
            (a) => a.classId === card.classId && a.subjectId === card.subjectId
          );
          expect(matching).toHaveLength(1);
        }
      })
    );
  });

  /**
   * Cards carry the correct periodId from the current period.
   */
  test("cards carry the correct periodId when a current period exists", () => {
    fc.assert(
      fc.property(
        assignmentListArb,
        fc.record({ id: idArb, name: idArb }),
        (assignments, period) => {
          const cards = buildCards(assignments, new Map(), new Map(), period);
          for (const card of cards) {
            expect(card.periodId).toBe(period.id);
            expect(card.periodName).toBe(period.name);
          }
        }
      )
    );
  });

  /**
   * periodId is null when no current period exists.
   */
  test("periodId is null when no current period", () => {
    fc.assert(
      fc.property(assignmentListArb, (assignments) => {
        const cards = buildCards(assignments, new Map(), new Map(), null);
        for (const card of cards) {
          expect(card.periodId).toBeNull();
          expect(card.periodName).toBeNull();
        }
      })
    );
  });

  /**
   * totalStudents on each card matches the student count for that class.
   */
  test("totalStudents on each card matches the student count for that class", () => {
    fc.assert(
      fc.property(
        assignmentListArb,
        (assignments) => {
          if (assignments.length === 0) return;

          // Build a student-count map for every classId in the assignments.
          const studentCountByClass = new Map<string, number>();
          for (const a of assignments) {
            if (!studentCountByClass.has(a.classId)) {
              // Assign a deterministic but varied count based on classId length.
              studentCountByClass.set(a.classId, (a.classId.length % 40) + 1);
            }
          }

          const cards = buildCards(
            assignments,
            studentCountByClass,
            new Map(),
            { id: "p1", name: "Term 1" }
          );

          for (const card of cards) {
            const expected = studentCountByClass.get(card.classId) ?? 0;
            expect(card.totalStudents).toBe(expected);
          }
        }
      )
    );
  });

  /**
   * totalStudents defaults to 0 when the class is absent from the count map.
   */
  test("totalStudents defaults to 0 when class is not in the count map", () => {
    fc.assert(
      fc.property(assignmentArb, (assignment) => {
        const cards = buildCards([assignment], new Map(), new Map(), null);
        expect(cards[0].totalStudents).toBe(0);
      })
    );
  });

  /**
   * enteredCount defaults to 0 when no entries exist for the (classId, subjectId) pair.
   */
  test("enteredCount defaults to 0 when no entries exist for the pair", () => {
    fc.assert(
      fc.property(assignmentArb, (assignment) => {
        const cards = buildCards([assignment], new Map(), new Map(), null);
        expect(cards[0].enteredCount).toBe(0);
      })
    );
  });
});
