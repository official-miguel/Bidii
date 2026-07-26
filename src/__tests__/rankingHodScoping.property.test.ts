/**
 * Property 10 — HOD ranking dept scoping
 *
 * Validates: Requirements 7.4
 *
 * An HOD requesting scope=department for a dept they DON'T head must get 403.
 * An HOD requesting their OWN dept must get 200.
 * This must hold for any arbitrary pair of distinct dept IDs.
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
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    teacher: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/assessment/auth844", () => ({
  resolveAssessmentActor: jest.fn(),
  canAccessDashboard: jest.fn(),
}));

jest.mock("@/lib/assessment/teacherRanking", () => ({
  computeTeacherRanking: jest.fn(),
}));

// ---- Imports ---------------------------------------------------------
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveAssessmentActor,
  canAccessDashboard,
} from "@/lib/assessment/auth844";
import { computeTeacherRanking } from "@/lib/assessment/teacherRanking";
import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockResolveActor   = resolveAssessmentActor as jest.MockedFunction<typeof resolveAssessmentActor>;
const mockCanDashboard   = canAccessDashboard as jest.MockedFunction<typeof canAccessDashboard>;
const mockComputeRanking = computeTeacherRanking as jest.MockedFunction<typeof computeTeacherRanking>;

// ---- Shared fixtures --------------------------------------------------

const SCHOOL_ID = "school-1";

const HOD_USER = {
  id: "user-hod1",
  role: "TEACHER",
  schoolId: SCHOOL_ID,
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type ActorType = Awaited<ReturnType<typeof resolveAssessmentActor>>;

function makeHodActor(): ActorType {
  return {
    user: HOD_USER,
    teacher: { id: "teacher-hod1" },
    roles: [
      {
        id: "ar-hod1",
        role: "HOD" as const,
        subjectId: null,
        learningAreaId: null,
        competencyUnitId: null,
        frameworkId: "fw-1",
        teacherId: "teacher-hod1",
        schoolId: SCHOOL_ID,
      },
    ],
    isPrincipal: false,
    classTeacherOfId: null,
    adminCanView: false,
    adminCanManage: false,
  } as unknown as ActorType;
}

/** A few fake ranking results for successful responses. */
function makeFakeRankResults(n = 5): TeacherRankResult[] {
  return Array.from({ length: n }, (_, i) => ({
    rank:            i + 1,
    teacherId:       `teacher-${i + 1}`,
    teacherName:     `Teacher ${i + 1}`,
    staffId:         `STAFF${String(i + 1).padStart(3, "0")}`,
    departmentId:    "dept-A",
    departmentName:  "Sciences",
    subjectName:     "Mathematics",
    compositeScore:  1 - i * 0.01,
    normImprovement: 0.5,
    completionScore: 0.8,
    normAbsolute:    0.7,
    trendDirection:  0 as const,
    absoluteMean:    7.5,
    prevMean:        7.0,
  }));
}

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ============================================================================
// Property 10 — HOD ranking dept scoping
// ============================================================================

describe("Property 10 — HOD ranking dept scoping", () => {
  const { prisma } = require("@/lib/prisma");

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findMany.mockResolvedValue([]);
    prisma.teacher.findUnique.mockResolvedValue(null);
  });

  // --------------------------------------------------------------------------
  // 1. HOD requesting scope=department for their OWN dept → 200
  // --------------------------------------------------------------------------

  test("HOD requesting scope=department for their own dept (dept-A) gets 200", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(makeHodActor());
    mockCanDashboard.mockReturnValue(true);

    // HOD heads dept-A
    prisma.department.findFirst.mockResolvedValue({ id: "dept-A" });
    prisma.department.findMany.mockResolvedValue([{ id: "dept-A", name: "Sciences" }]);
    mockComputeRanking.mockResolvedValue(makeFakeRankResults());

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=department&departmentId=dept-A"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe("department");
  });

  // --------------------------------------------------------------------------
  // 2. HOD requesting scope=department for a DIFFERENT dept → 403
  // --------------------------------------------------------------------------

  test("HOD requesting scope=department for a different dept (dept-B) gets 403", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(makeHodActor());
    mockCanDashboard.mockReturnValue(true);

    // HOD heads dept-A, but requests dept-B
    prisma.department.findFirst.mockResolvedValue({ id: "dept-A" });
    mockComputeRanking.mockResolvedValue([]);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=department&departmentId=dept-B"
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 3. HOD requesting scope=school (no departmentId) → 200, scoped to their dept
  // --------------------------------------------------------------------------

  test("HOD requesting scope=school (no departmentId) gets 200 and result scoped to their dept", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    const deptResults = makeFakeRankResults(4);

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(makeHodActor());
    mockCanDashboard.mockReturnValue(true);

    prisma.department.findFirst.mockResolvedValue({ id: "dept-A" });
    prisma.department.findMany.mockResolvedValue([{ id: "dept-A", name: "Sciences" }]);
    mockComputeRanking.mockResolvedValue(deptResults);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    // HOD in school scope gets their dept as fullList
    expect(body.fullList.length).toBe(deptResults.length);
    // ownDepartmentId is populated
    expect(body.ownDepartmentId).toBe("dept-A");
  });

  // --------------------------------------------------------------------------
  // 4. Property test (fast-check): for any two distinct dept IDs A and B,
  //    if HOD's dept is A and they request dept B → always 403
  //
  // **Validates: Requirements 7.4**
  // --------------------------------------------------------------------------

  test("Property: HOD always gets 403 when requesting a dept that is not their own", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    await fc.assert(
      fc.asyncProperty(
        // Generate two distinct non-empty strings as dept IDs
        fc.tuple(
          fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/),
          fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/)
        ).filter(([a, b]) => a !== b),
        async ([deptA, deptB]) => {
          jest.clearAllMocks();

          mockGetCurrentUser.mockResolvedValue(HOD_USER);
          mockResolveActor.mockResolvedValue(makeHodActor());
          mockCanDashboard.mockReturnValue(true);

          // HOD's dept is deptA; they request deptB
          prisma.department.findFirst.mockResolvedValue({ id: deptA });
          prisma.department.findMany.mockResolvedValue([]);
          mockComputeRanking.mockResolvedValue([]);

          const req = makeReq(
            `http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=department&departmentId=${encodeURIComponent(deptB)}`
          );
          const res = await GET(req);

          expect(res.status).toBe(403);
        }
      ),
      { numRuns: 50 }
    );
  });

  // --------------------------------------------------------------------------
  // 5. Missing periodId → 400
  // --------------------------------------------------------------------------

  test("missing periodId gets 400", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(makeHodActor());
    mockCanDashboard.mockReturnValue(true);

    prisma.department.findFirst.mockResolvedValue({ id: "dept-A" });

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?scope=department&departmentId=dept-A"
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 6. scope=department but missing departmentId → 400
  // --------------------------------------------------------------------------

  test("scope=department with missing departmentId gets 400", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(makeHodActor());
    mockCanDashboard.mockReturnValue(true);

    prisma.department.findFirst.mockResolvedValue({ id: "dept-A" });

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=department"
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});
