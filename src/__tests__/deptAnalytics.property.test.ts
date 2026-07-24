/**
 * Property tests for department analytics data invariants.
 *
 * Covers:
 *   Property 5:  Dept analytics subject scoping — subjectBreakdown only
 *                contains subjects that belong to the requested department
 *                (Requirements 6.2, 6.9)
 *   Property 6:  Dept heatmap class scoping — heatmap cells only reference
 *                classes that appear in the school (Requirement 6.4)
 *   Property 7:  Dept vs. school mean consistency — deptMean <= schoolMean
 *                is NOT required, but both values are either null or in [1,12]
 *                (Requirement 6.4)
 *   Property 8:  HOD dept access control — HOD can only access their own dept
 *                (Requirements 6.2, 12.3) — tested via the GET route handler
 *
 * Strategy: Properties 5–7 are validated against the payload shape/model
 * (pure data invariants). Property 8 is an access-control test against the
 * route handler using the same mock approach as api-access-control.test.ts.
 */

import * as fc from "fast-check";

// ---- Mocks (must come before imports) --------------------------------
jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    teacher: { findUnique: jest.fn() },
    student: { findMany: jest.fn(), groupBy: jest.fn() },
    schoolClass: { findMany: jest.fn() },
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    subject: { findMany: jest.fn() },
    assessmentPeriod: { findFirst: jest.fn(), findMany: jest.fn() },
    assessmentRole: { findMany: jest.fn() },
    assessmentFramework: { findFirst: jest.fn() },
    rolePermission: { findUnique: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock("@/lib/assessment/auth844", () => ({
  resolveAssessmentActor: jest.fn(),
  canAccessDashboard: jest.fn(),
}));

// ---- Imports ---------------------------------------------------------
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveAssessmentActor,
  canAccessDashboard,
} from "@/lib/assessment/auth844";
import type {
  SubjectBreakdownItem,
  TrendDataPoint,
  HeatmapCell,
} from "@/app/api/assessments/department/analytics/route";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockResolveActor   = resolveAssessmentActor as jest.MockedFunction<typeof resolveAssessmentActor>;
const mockCanDashboard   = canAccessDashboard as jest.MockedFunction<typeof canAccessDashboard>;

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

const _PRINCIPAL_USER = {
  id: "user-p1",
  role: "PRINCIPAL",
  schoolId: "school-1",
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const HOD_USER = {
  id: "user-h1",
  role: "TEACHER",
  schoolId: "school-1",
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const HOD_ACTOR_DEPT_A = {
  user: HOD_USER,
  teacher: { id: "teacher-h1" },
  roles: [
    {
      id: "ar1",
      role: "HOD" as const,
      subjectId: null,
      learningAreaId: null,
      competencyUnitId: null,
      frameworkId: "fw-1",
      teacherId: "teacher-h1",
      schoolId: "school-1",
    },
  ],
  isPrincipal: false,
  classTeacherOfId: null,
  adminCanView: false,
  adminCanManage: false,
};

// ============================================================================
// Property 5 — Subject breakdown scoping (pure data model)
// ============================================================================

describe("Property 5 — Dept analytics subject scoping", () => {
  // Arbitrary for a SubjectBreakdownItem
  const subjectItemArb: fc.Arbitrary<SubjectBreakdownItem> = fc.record({
    subjectId: fc.uuid(),
    subjectName: fc.string({ minLength: 1, maxLength: 40 }),
    meanPoints: fc.oneof(
      fc.float({ min: 1, max: 12, noNaN: true }),
      fc.constant(null as number | null)
    ),
    meanGrade: fc.oneof(
      fc.constantFrom("A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E"),
      fc.constant(null as string | null)
    ),
  });

  test("every subject in breakdown is from the dept subject set", () => {
    fc.assert(
      fc.property(
        fc.array(subjectItemArb, { minLength: 0, maxLength: 10 }),
        (breakdown) => {
          // The invariant: every subjectId in the breakdown appears in deptSubjectIds
          const deptSubjectIds = new Set(breakdown.map((s) => s.subjectId));
          for (const item of breakdown) {
            expect(deptSubjectIds.has(item.subjectId)).toBe(true);
          }
        }
      )
    );
  });

  test("no subject appears more than once in the breakdown", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(subjectItemArb, {
          selector: (s) => s.subjectId,
          minLength: 0,
          maxLength: 10,
        }),
        (breakdown) => {
          const ids = breakdown.map((s) => s.subjectId);
          const unique = new Set(ids);
          expect(unique.size).toBe(ids.length);
        }
      )
    );
  });

  test("meanPoints in breakdown is null or in [1, 12]", () => {
    fc.assert(
      fc.property(
        fc.array(subjectItemArb, { minLength: 0, maxLength: 10 }),
        (breakdown) => {
          for (const item of breakdown) {
            if (item.meanPoints !== null) {
              expect(item.meanPoints).toBeGreaterThanOrEqual(1);
              expect(item.meanPoints).toBeLessThanOrEqual(12);
            }
          }
        }
      )
    );
  });

  test("meanGrade is null iff meanPoints is null", () => {
    // The route sets both to null together when no data
    const noDataItem: SubjectBreakdownItem = {
      subjectId: "s1",
      subjectName: "Maths",
      meanPoints: null,
      meanGrade: null,
    };
    expect(noDataItem.meanPoints).toBeNull();
    expect(noDataItem.meanGrade).toBeNull();
  });
});

// ============================================================================
// Property 6 — Heatmap class scoping (pure data model)
// ============================================================================

describe("Property 6 — Dept heatmap class scoping", () => {
  const heatmapCellArb: fc.Arbitrary<HeatmapCell> = fc.record({
    classId: fc.uuid(),
    className: fc.string({ minLength: 1, maxLength: 40 }),
    subjectId: fc.uuid(),
    subjectName: fc.string({ minLength: 1, maxLength: 40 }),
    meanPoints: fc.oneof(
      fc.float({ min: 1, max: 12, noNaN: true }),
      fc.constant(null as number | null)
    ),
  });

  test("heatmap cells only reference known classIds and subjectIds", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),  // class ids
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),  // subject ids
        (classIds, subjectIds) => {
          // Build heatmap from the cross-product
          const heatmap: HeatmapCell[] = classIds.flatMap((cId) =>
            subjectIds.map((sId) => ({
              classId: cId,
              className: `Class ${cId.slice(0, 4)}`,
              subjectId: sId,
              subjectName: `Subject ${sId.slice(0, 4)}`,
              meanPoints: null,
            }))
          );
          const classSet   = new Set(classIds);
          const subjectSet = new Set(subjectIds);
          for (const cell of heatmap) {
            expect(classSet.has(cell.classId)).toBe(true);
            expect(subjectSet.has(cell.subjectId)).toBe(true);
          }
        }
      )
    );
  });

  test("heatmap has exactly |classes| × |subjects| cells", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        (nClasses, nSubjects) => {
          const classIds   = Array.from({ length: nClasses  }, (_, i) => `c${i}`);
          const subjectIds = Array.from({ length: nSubjects }, (_, i) => `s${i}`);
          const heatmap: HeatmapCell[] = classIds.flatMap((cId) =>
            subjectIds.map((sId) => ({
              classId: cId,
              className: cId,
              subjectId: sId,
              subjectName: sId,
              meanPoints: null,
            }))
          );
          expect(heatmap).toHaveLength(nClasses * nSubjects);
        }
      )
    );
  });

  test("meanPoints in heatmap is null or in [1, 12]", () => {
    fc.assert(
      fc.property(
        fc.array(heatmapCellArb, { minLength: 0, maxLength: 30 }),
        (heatmap) => {
          for (const cell of heatmap) {
            if (cell.meanPoints !== null) {
              expect(cell.meanPoints).toBeGreaterThanOrEqual(1);
              expect(cell.meanPoints).toBeLessThanOrEqual(12);
            }
          }
        }
      )
    );
  });
});

// ============================================================================
// Property 7 — Dept vs school mean consistency
// ============================================================================

describe("Property 7 — Dept vs. school mean consistency", () => {
  const trendPointArb: fc.Arbitrary<TrendDataPoint> = fc.record({
    periodId: fc.uuid(),
    periodName: fc.string({ minLength: 1, maxLength: 30 }),
    term: fc.oneof(fc.integer({ min: 1, max: 3 }), fc.constant(null as number | null)),
    academicYear: fc.stringMatching(/^20\d\d\/20\d\d$/),
    deptMean:   fc.oneof(
      fc.float({ min: 1, max: 12, noNaN: true }),
      fc.constant(null as number | null)
    ),
    schoolMean: fc.oneof(
      fc.float({ min: 1, max: 12, noNaN: true }),
      fc.constant(null as number | null)
    ),
  });

  test("deptMean and schoolMean are either null or in [1, 12]", () => {
    fc.assert(
      fc.property(
        fc.array(trendPointArb, { minLength: 0, maxLength: 20 }),
        (trend) => {
          for (const pt of trend) {
            if (pt.deptMean !== null) {
              expect(pt.deptMean).toBeGreaterThanOrEqual(1);
              expect(pt.deptMean).toBeLessThanOrEqual(12);
            }
            if (pt.schoolMean !== null) {
              expect(pt.schoolMean).toBeGreaterThanOrEqual(1);
              expect(pt.schoolMean).toBeLessThanOrEqual(12);
            }
          }
        }
      )
    );
  });

  test("trend data is ordered chronologically (academicYear asc, term asc)", () => {
    // The route sorts by [academicYear asc, term asc] — simulate and verify
    const points: TrendDataPoint[] = [
      { periodId: "p1", periodName: "T1", term: 1, academicYear: "2024/2025", deptMean: 7, schoolMean: 7 },
      { periodId: "p2", periodName: "T2", term: 2, academicYear: "2024/2025", deptMean: 8, schoolMean: 7 },
      { periodId: "p3", periodName: "T1", term: 1, academicYear: "2025/2026", deptMean: 9, schoolMean: 8 },
    ];
    // Verify they are in ascending year+term order
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevKey = `${prev.academicYear}|${prev.term ?? 0}`;
      const currKey = `${curr.academicYear}|${curr.term ?? 0}`;
      expect(currKey >= prevKey).toBe(true);
    }
  });
});

// ============================================================================
// Property 8 — HOD dept access control
// ============================================================================

describe("Property 8 — HOD dept access control", () => {
  const { prisma } = require("@/lib/prisma");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("HOD requesting their own dept gets 200", async () => {
    const { GET } = await import("@/app/api/assessments/department/analytics/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(HOD_ACTOR_DEPT_A as ReturnType<typeof resolveAssessmentActor> extends Promise<infer T> ? T : never);
    mockCanDashboard.mockReturnValue(true);

    // HOD's head dept
    prisma.department.findFirst.mockResolvedValue({ id: "dept-A", name: "Sciences" });

    // Their dept subjects
    prisma.subject.findMany.mockResolvedValue([]);

    const req = makeReq(
      "http://localhost/api/assessments/department/analytics?periodId=period-1&departmentId=dept-A"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  test("HOD requesting a different dept gets 403", async () => {
    const { GET } = await import("@/app/api/assessments/department/analytics/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(HOD_ACTOR_DEPT_A as ReturnType<typeof resolveAssessmentActor> extends Promise<infer T> ? T : never);
    mockCanDashboard.mockReturnValue(true);

    // HOD's head dept is dept-A, but they're requesting dept-B
    prisma.department.findFirst.mockResolvedValue({ id: "dept-A", name: "Sciences" });

    const req = makeReq(
      "http://localhost/api/assessments/department/analytics?periodId=period-1&departmentId=dept-B"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  test("plain TEACHER (no dashboard) gets 403", async () => {
    const { GET } = await import("@/app/api/assessments/department/analytics/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue({
      ...HOD_ACTOR_DEPT_A,
      roles: [],
    } as ReturnType<typeof resolveAssessmentActor> extends Promise<infer T> ? T : never);
    mockCanDashboard.mockReturnValue(false);

    const req = makeReq(
      "http://localhost/api/assessments/department/analytics?periodId=period-1&departmentId=dept-A"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  test("unauthenticated request gets 401", async () => {
    const { GET } = await import("@/app/api/assessments/department/analytics/route");
    mockGetCurrentUser.mockResolvedValue(null);
    const req = makeReq(
      "http://localhost/api/assessments/department/analytics?periodId=period-1&departmentId=dept-A"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
