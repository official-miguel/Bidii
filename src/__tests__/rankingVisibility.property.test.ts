/**
 * Property 9 — Teacher ranking visibility invariant
 *
 * Validates: Requirements 7.3, 12.4
 *
 * A plain TEACHER (role=TEACHER, canAccessDashboard=false, no HOD role)
 * in scope=school must ALWAYS receive `fullList = []`.
 * They can only see top3 and their own ownRow.
 *
 * Additional cases:
 *   - Plain teacher gets top3 (up to 3 entries)
 *   - Plain teacher gets their own ownRow
 *   - HOD in scope=school gets non-empty fullList (their dept)
 *   - Director (canAccessDashboard=true, not HOD) gets full list
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

const mockGetCurrentUser   = getCurrentUser       as jest.MockedFunction<typeof getCurrentUser>;
const mockResolveActor     = resolveAssessmentActor as jest.MockedFunction<typeof resolveAssessmentActor>;
const mockCanDashboard     = canAccessDashboard   as jest.MockedFunction<typeof canAccessDashboard>;
const mockComputeRanking   = computeTeacherRanking as jest.MockedFunction<typeof computeTeacherRanking>;

// ---- Shared fixtures --------------------------------------------------

const SCHOOL_ID = "school-1";

/** Plain teacher user — role=TEACHER, no dashboard access */
const PLAIN_TEACHER_USER = {
  id: "user-pt1",
  role: "TEACHER",
  schoolId: SCHOOL_ID,
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** HOD user — role=TEACHER, has HOD role, canAccessDashboard=true */
const HOD_USER = {
  id: "user-hod1",
  role: "TEACHER",
  schoolId: SCHOOL_ID,
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Director/Admin user — canAccessDashboard=true, no HOD role */
const DIRECTOR_USER = {
  id: "user-dir1",
  role: "ADMIN_STAFF",
  schoolId: SCHOOL_ID,
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type ActorType = Awaited<ReturnType<typeof resolveAssessmentActor>>;

const PLAIN_TEACHER_ACTOR: ActorType = {
  user: PLAIN_TEACHER_USER,
  teacher: { id: "teacher-pt1" },
  roles: [],
  isPrincipal: false,
  classTeacherOfId: null,
  adminCanView: false,
  adminCanManage: false,
} as unknown as ActorType;

const HOD_ACTOR: ActorType = {
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

const DIRECTOR_ACTOR: ActorType = {
  user: DIRECTOR_USER,
  teacher: null,
  roles: [],
  isPrincipal: false,
  classTeacherOfId: null,
  adminCanView: true,
  adminCanManage: true,
} as unknown as ActorType;

// ---- Helpers ----------------------------------------------------------

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

/**
 * Build N fake TeacherRankResult objects for property-based testing.
 * Ranks are assigned 1…N in order.
 */
function makeFakeRankResults(n: number, teacherIdPrefix = "teacher-"): TeacherRankResult[] {
  return Array.from({ length: n }, (_, i) => ({
    rank:            i + 1,
    teacherId:       `${teacherIdPrefix}${i + 1}`,
    teacherName:     `Teacher ${i + 1}`,
    staffId:         `STAFF${String(i + 1).padStart(3, "0")}`,
    departmentId:    "dept-1",
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

// fast-check arbitrary for a single TeacherRankResult
const rankResultArb: fc.Arbitrary<TeacherRankResult> = fc.record({
  rank:            fc.integer({ min: 1, max: 100 }),
  teacherId:       fc.uuid(),
  teacherName:     fc.string({ minLength: 1, maxLength: 40 }),
  staffId:         fc.string({ minLength: 1, maxLength: 10 }),
  departmentId:    fc.oneof(fc.uuid(), fc.constant(null as string | null)),
  departmentName:  fc.oneof(fc.string({ minLength: 1, maxLength: 40 }), fc.constant(null as string | null)),
  subjectName:     fc.oneof(fc.string({ minLength: 1, maxLength: 40 }), fc.constant(null as string | null)),
  compositeScore:  fc.float({ min: 0, max: 1, noNaN: true }),
  normImprovement: fc.float({ min: 0, max: 1, noNaN: true }),
  completionScore: fc.float({ min: 0, max: 1, noNaN: true }),
  normAbsolute:    fc.float({ min: 0, max: 1, noNaN: true }),
  trendDirection:  fc.constantFrom(1 as const, 0 as const, -1 as const),
  absoluteMean:    fc.oneof(fc.float({ min: 1, max: 12, noNaN: true }), fc.constant(null as number | null)),
  prevMean:        fc.oneof(fc.float({ min: 1, max: 12, noNaN: true }), fc.constant(null as number | null)),
});

// ============================================================================
// Property 9 — Teacher ranking visibility invariant
// ============================================================================

describe("Property 9 — Teacher ranking visibility invariant", () => {
  const { prisma } = require("@/lib/prisma");

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no departments list for plain teachers
    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.teacher.findUnique.mockResolvedValue(null);
  });

  // --------------------------------------------------------------------------
  // Property test (fast-check): for any N teachers (0–20), plain teacher in
  // scope=school ALWAYS gets fullList.length === 0
  // --------------------------------------------------------------------------

  test("Property: plain teacher in scope=school always gets fullList = [] regardless of ranking size", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        async (n) => {
          jest.clearAllMocks();

          // Setup mocks for a plain teacher
          mockGetCurrentUser.mockResolvedValue(PLAIN_TEACHER_USER);
          mockResolveActor.mockResolvedValue(PLAIN_TEACHER_ACTOR);
          mockCanDashboard.mockReturnValue(false);

          prisma.department.findMany.mockResolvedValue([]);
          prisma.department.findFirst.mockResolvedValue(null);
          prisma.teacher.findUnique.mockResolvedValue({ primaryDepartmentId: "dept-1" });

          // computeTeacherRanking returns N fake results
          const fakeResults = makeFakeRankResults(n);
          mockComputeRanking.mockResolvedValue(fakeResults);

          const req = makeReq(
            "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
          );
          const res = await GET(req);
          const body = await res.json();

          // INVARIANT: plain teacher must never see fullList entries in school scope
          expect(res.status).toBe(200);
          expect(body.fullList).toBeDefined();
          expect(body.fullList.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  // --------------------------------------------------------------------------
  // Plain teacher gets top3 (up to 3 entries)
  // --------------------------------------------------------------------------

  test("plain teacher in scope=school receives top3 with at most 3 entries", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        async (n) => {
          jest.clearAllMocks();

          mockGetCurrentUser.mockResolvedValue(PLAIN_TEACHER_USER);
          mockResolveActor.mockResolvedValue(PLAIN_TEACHER_ACTOR);
          mockCanDashboard.mockReturnValue(false);

          prisma.department.findMany.mockResolvedValue([]);
          prisma.department.findFirst.mockResolvedValue(null);
          prisma.teacher.findUnique.mockResolvedValue({ primaryDepartmentId: "dept-1" });

          mockComputeRanking.mockResolvedValue(makeFakeRankResults(n));

          const req = makeReq(
            "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
          );
          const res = await GET(req);
          const body = await res.json();

          expect(res.status).toBe(200);
          expect(body.top3).toBeDefined();
          expect(body.top3.length).toBeLessThanOrEqual(3);
          // top3 should be min(n, 3)
          expect(body.top3.length).toBe(Math.min(n, 3));
        }
      ),
      { numRuns: 50 }
    );
  });

  // --------------------------------------------------------------------------
  // Plain teacher gets their own ownRow if they appear in the ranking results
  // --------------------------------------------------------------------------

  test("plain teacher gets their own ownRow when they appear in the ranking results", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    // Build a result set where the plain teacher is in position 5
    const results = makeFakeRankResults(10);
    // Replace one entry with the caller's teacherId
    results[4].teacherId = "teacher-pt1";
    results[4].rank = 5;

    mockGetCurrentUser.mockResolvedValue(PLAIN_TEACHER_USER);
    mockResolveActor.mockResolvedValue(PLAIN_TEACHER_ACTOR);
    mockCanDashboard.mockReturnValue(false);
    mockComputeRanking.mockResolvedValue(results);

    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.teacher.findUnique.mockResolvedValue({ primaryDepartmentId: "dept-1" });

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // ownRow must be present and refer to the caller
    expect(body.ownRow).not.toBeNull();
    expect(body.ownRow.teacherId).toBe("teacher-pt1");
    // fullList still empty
    expect(body.fullList.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // ownRow is null when teacher does not appear in results
  // --------------------------------------------------------------------------

  test("plain teacher ownRow is null when they do not appear in the ranking", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    // Results that don't include the caller's teacherId
    const results = makeFakeRankResults(5, "other-teacher-");

    mockGetCurrentUser.mockResolvedValue(PLAIN_TEACHER_USER);
    mockResolveActor.mockResolvedValue(PLAIN_TEACHER_ACTOR);
    mockCanDashboard.mockReturnValue(false);
    mockComputeRanking.mockResolvedValue(results);

    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.teacher.findUnique.mockResolvedValue({ primaryDepartmentId: "dept-1" });

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ownRow).toBeNull();
    expect(body.fullList.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // HOD in scope=school gets a non-empty fullList (their dept)
  // --------------------------------------------------------------------------

  test("HOD in scope=school gets a non-empty fullList scoped to their department", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    const deptResults = makeFakeRankResults(6);

    mockGetCurrentUser.mockResolvedValue(HOD_USER);
    mockResolveActor.mockResolvedValue(HOD_ACTOR);
    // HOD can access dashboard
    mockCanDashboard.mockReturnValue(true);

    // HOD's department
    prisma.department.findFirst.mockResolvedValue({ id: "dept-1" });
    // Departments list for HOD (canAccessDashboard=true means they get list too)
    prisma.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Sciences" },
    ]);
    prisma.teacher.findUnique.mockResolvedValue(null);

    // computeTeacherRanking called with their dept scope returns dept results
    mockComputeRanking.mockResolvedValue(deptResults);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fullList.length).toBeGreaterThan(0);
    expect(body.fullList.length).toBe(deptResults.length);
  });

  // --------------------------------------------------------------------------
  // Director (canAccessDashboard=true, not HOD) in scope=school gets full list
  // --------------------------------------------------------------------------

  test("Director (canAccessDashboard=true, not HOD) in scope=school gets full school list", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    const schoolResults = makeFakeRankResults(15);

    mockGetCurrentUser.mockResolvedValue(DIRECTOR_USER);
    mockResolveActor.mockResolvedValue(DIRECTOR_ACTOR);
    mockCanDashboard.mockReturnValue(true);

    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Sciences" },
      { id: "dept-2", name: "Languages" },
    ]);
    prisma.teacher.findUnique.mockResolvedValue(null);

    mockComputeRanking.mockResolvedValue(schoolResults);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // Director must receive the full list, not an empty array
    expect(body.fullList.length).toBeGreaterThan(0);
    expect(body.fullList.length).toBe(schoolResults.length);
  });

  // --------------------------------------------------------------------------
  // Unauthenticated request gets 401
  // --------------------------------------------------------------------------

  test("unauthenticated request gets 401", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(null);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?periodId=period-1&scope=school"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  // Missing periodId gets 400
  // --------------------------------------------------------------------------

  test("missing periodId gets 400", async () => {
    const { GET } = await import("@/app/api/assessments/staff/ranking/route");

    mockGetCurrentUser.mockResolvedValue(PLAIN_TEACHER_USER);
    mockResolveActor.mockResolvedValue(PLAIN_TEACHER_ACTOR);
    mockCanDashboard.mockReturnValue(false);

    const req = makeReq(
      "http://localhost/api/assessments/staff/ranking?scope=school"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
