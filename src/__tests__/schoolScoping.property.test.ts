/**
 * Property 17 — New endpoints enforce school scoping
 * Validates: Requirements 12.1–12.6
 *
 * Every new endpoint scopes all Prisma queries to `user.schoolId`.
 * A user from school-A must never trigger queries against school-B data.
 *
 * Strategy: for each endpoint mock `getCurrentUser` to return a user with a
 * specific `schoolId`, call the handler, then verify every Prisma call that
 * accepts a `where.schoolId` filter was called with that exact `schoolId`.
 *
 * Endpoints covered:
 *   1. GET  /api/assessments/home/teacher     — teacher & student queries include schoolId
 *   2. GET  /api/assessments/staff/ranking    — computeTeacherRanking first arg = schoolId
 *   3. PUT  /api/assessments/report/remarks   — student.findFirst + reportRemark.upsert
 *                                               both use schoolId: user.schoolId
 */

import * as fc from "fast-check";

// ---- Mocks (MUST come before any imports that load the modules) -----------

jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    teacher: { findUnique: jest.fn(), findMany: jest.fn() },
    student: { findFirst: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    schoolClass: { findMany: jest.fn() },
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    subject: { findMany: jest.fn() },
    assessmentPeriod: { findFirst: jest.fn(), findMany: jest.fn() },
    assessmentRole: { findMany: jest.fn() },
    assessmentFramework: { findFirst: jest.fn() },
    rolePermission: { findUnique: jest.fn() },
    classSubjectTeacher: { findMany: jest.fn() },
    reportRemark: { findUnique: jest.fn(), upsert: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock("@/lib/assessment/auth844", () => ({
  resolveAssessmentActor: jest.fn(),
  canAccessDashboard: jest.fn(),
  canGenerateReportCard: jest.fn(),
}));

jest.mock("@/lib/assessment/teacherRanking", () => ({
  computeTeacherRanking: jest.fn(),
}));

jest.mock("@/lib/ai/gemini", () => ({
  callGemini: jest.fn(),
  AiServiceError: class AiServiceError extends Error {},
}));

// ---- Imports (after mocks) ------------------------------------------------

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveAssessmentActor,
  canAccessDashboard,
  canGenerateReportCard,
} from "@/lib/assessment/auth844";
import { computeTeacherRanking } from "@/lib/assessment/teacherRanking";
import { prisma } from "@/lib/prisma";

const mockGetCurrentUser  = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockResolveActor    = resolveAssessmentActor as jest.MockedFunction<typeof resolveAssessmentActor>;
const mockCanDashboard    = canAccessDashboard as jest.MockedFunction<typeof canAccessDashboard>;
const mockCanReportCard   = canGenerateReportCard as jest.MockedFunction<typeof canGenerateReportCard>;
const mockComputeRanking  = computeTeacherRanking as jest.MockedFunction<typeof computeTeacherRanking>;

// ---- Helpers ----------------------------------------------------------------

function makeReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

/** Build a user fixture with a given schoolId. */
function makeTeacherUser(schoolId: string) {
  return {
    id: "user-t1",
    role: "TEACHER" as const,
    schoolId,
    isActive: true,
    staffRoleId: null,
  } as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
}

/** Minimal actor stub for a TEACHER with no special roles. */
function makeActor(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    user,
    teacher: { id: "teacher-1" },
    roles: [],
    isPrincipal: false,
    classTeacherOfId: null,
    adminCanView: false,
    adminCanManage: false,
  };
}

// ============================================================================
// Property 17a — GET /api/assessments/home/teacher enforces school scoping
// ============================================================================

describe("Property 17a — GET /api/assessments/home/teacher school scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * For any non-empty schoolId, student.groupBy is called with
   * where.schoolId === user.schoolId (never a different school).
   *
   * Validates: Requirements 12.1, 12.2
   */
  test("property: student.groupBy always uses the user's own schoolId (20+ runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        async (schoolId) => {
          jest.clearAllMocks();

          const user = makeTeacherUser(schoolId);
          mockGetCurrentUser.mockResolvedValue(user);

          (prisma.teacher.findUnique as jest.Mock).mockResolvedValue({ id: "t1" });
          // Return one assignment so the route doesn't early-return before groupBy
          (prisma.classSubjectTeacher.findMany as jest.Mock).mockResolvedValue([
            {
              classId: "class-1",
              subjectId: "subj-1",
              schoolClass: { id: "class-1", name: "Form 1A", frameworkType: "EIGHT_FOUR_FOUR" },
              subject: { id: "subj-1", name: "Maths", code: "MTH" },
            },
          ]);
          (prisma.assessmentPeriod.findFirst as jest.Mock).mockResolvedValue(null);
          (prisma.student.groupBy as jest.Mock).mockResolvedValue([]);

          const { GET } = await import("@/app/api/assessments/home/teacher/route");
          await GET();

          const groupByCalls = (prisma.student.groupBy as jest.Mock).mock.calls;
          // groupBy must have been called (at least once) and every call uses user.schoolId
          expect(groupByCalls.length).toBeGreaterThanOrEqual(1);
          for (const [args] of groupByCalls) {
            expect(args?.where?.schoolId).toBe(schoolId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Concrete example: schoolId = "school-test-123"
   * teacher.findUnique is called with where: { userId: user.id }.
   * student.groupBy is called with where.schoolId = "school-test-123".
   *
   * Validates: Requirements 12.1, 12.2
   */
  test('concrete: schoolId "school-test-123" — teacher.findUnique uses userId, student.groupBy uses schoolId', async () => {
    const schoolId = "school-test-123";
    const user = makeTeacherUser(schoolId);
    mockGetCurrentUser.mockResolvedValue(user);

    (prisma.teacher.findUnique as jest.Mock).mockResolvedValue({ id: "t1" });
    (prisma.classSubjectTeacher.findMany as jest.Mock).mockResolvedValue([
      {
        classId: "class-1",
        subjectId: "subj-1",
        schoolClass: { id: "class-1", name: "Form 1A", frameworkType: "EIGHT_FOUR_FOUR" },
        subject: { id: "subj-1", name: "Maths", code: "MTH" },
      },
    ]);
    (prisma.assessmentPeriod.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.student.groupBy as jest.Mock).mockResolvedValue([]);

    const { GET } = await import("@/app/api/assessments/home/teacher/route");
    const res = await GET();

    // Auth guard passed → 200
    expect(res.status).toBe(200);

    // teacher.findUnique called with where: { userId: user.id } (user-scoped, implicitly school-scoped)
    expect(prisma.teacher.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id } })
    );

    // student.groupBy called with where.schoolId = "school-test-123"
    const groupByCalls = (prisma.student.groupBy as jest.Mock).mock.calls;
    expect(groupByCalls.length).toBeGreaterThanOrEqual(1);
    for (const [args] of groupByCalls) {
      expect(args.where.schoolId).toBe(schoolId);
    }
  });
});

// ============================================================================
// Property 17b — GET /api/assessments/staff/ranking enforces school scoping
// ============================================================================

describe("Property 17b — GET /api/assessments/staff/ranking school scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * For any non-empty schoolId, computeTeacherRanking first arg === user.schoolId.
   *
   * Validates: Requirements 12.1, 12.3
   */
  test("property: computeTeacherRanking is always called with user.schoolId as first arg (20+ runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        async (schoolId) => {
          jest.clearAllMocks();

          const user = makeTeacherUser(schoolId);
          mockGetCurrentUser.mockResolvedValue(user);
          mockResolveActor.mockResolvedValue(
            makeActor(user) as Awaited<ReturnType<typeof resolveAssessmentActor>>
          );
          mockCanDashboard.mockReturnValue(false);
          mockComputeRanking.mockResolvedValue([]);

          const { GET } = await import("@/app/api/assessments/staff/ranking/route");
          const req = makeReq(
            `http://localhost/api/assessments/staff/ranking?periodId=period-1`
          );
          await GET(req);

          const calls = mockComputeRanking.mock.calls;
          expect(calls.length).toBeGreaterThanOrEqual(1);
          for (const [firstArg] of calls) {
            expect(firstArg).toBe(schoolId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Concrete example: schoolId = "school-test-123"
   * computeTeacherRanking(schoolId, periodId, ...) — first arg is "school-test-123".
   *
   * Validates: Requirements 12.1, 12.3
   */
  test('concrete: schoolId "school-test-123" — computeTeacherRanking first arg is schoolId', async () => {
    const schoolId = "school-test-123";
    const periodId = "period-1";
    const user = makeTeacherUser(schoolId);

    mockGetCurrentUser.mockResolvedValue(user);
    mockResolveActor.mockResolvedValue(
      makeActor(user) as Awaited<ReturnType<typeof resolveAssessmentActor>>
    );
    mockCanDashboard.mockReturnValue(false);
    mockComputeRanking.mockResolvedValue([]);

    const { GET } = await import("@/app/api/assessments/staff/ranking/route");
    const req = makeReq(
      `http://localhost/api/assessments/staff/ranking?periodId=${periodId}`
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    const calls = mockComputeRanking.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // First call: first arg must be schoolId
    expect(calls[0][0]).toBe(schoolId);
    // Second arg must be periodId
    expect(calls[0][1]).toBe(periodId);
  });

  /**
   * schoolId from one user must never appear in calls seeded by a different schoolId.
   *
   * Validates: Requirements 12.1, 12.3, 12.6
   */
  test("property: schoolId from user-A is never passed when handling user-B request (20+ runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        async (schoolA, schoolB) => {
          // Skip the trivially-equal case — scoping invariant is only interesting
          // when the two schools are actually different.
          if (schoolA === schoolB) return;

          jest.clearAllMocks();

          const userB = makeTeacherUser(schoolB);
          mockGetCurrentUser.mockResolvedValue(userB);
          mockResolveActor.mockResolvedValue(
            makeActor(userB) as Awaited<ReturnType<typeof resolveAssessmentActor>>
          );
          mockCanDashboard.mockReturnValue(false);
          mockComputeRanking.mockResolvedValue([]);

          const { GET } = await import("@/app/api/assessments/staff/ranking/route");
          const req = makeReq(
            `http://localhost/api/assessments/staff/ranking?periodId=period-1`
          );
          await GET(req);

          const calls = mockComputeRanking.mock.calls;
          for (const [firstArg] of calls) {
            // Must use schoolB's id, never schoolA's
            expect(firstArg).not.toBe(schoolA);
            expect(firstArg).toBe(schoolB);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Property 17c — PUT /api/assessments/report/remarks enforces school scoping
// ============================================================================

describe("Property 17c — PUT /api/assessments/report/remarks school scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * For any non-empty schoolId, prisma.student.findFirst is called with
   * where.schoolId === user.schoolId (never a different school).
   *
   * Validates: Requirements 12.1, 12.5
   */
  test("property: student.findFirst always uses user.schoolId in where clause (20+ runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        async (schoolId) => {
          jest.clearAllMocks();

          const user = makeTeacherUser(schoolId);
          mockGetCurrentUser.mockResolvedValue(user);
          mockResolveActor.mockResolvedValue(
            makeActor(user) as Awaited<ReturnType<typeof resolveAssessmentActor>>
          );
          mockCanReportCard.mockReturnValue(true);

          (prisma.student.findFirst as jest.Mock).mockResolvedValue({
            id: "s1",
            classId: "class-1",
          });
          (prisma.reportRemark.upsert as jest.Mock).mockResolvedValue({
            draftRemark: null,
            editedRemark: "Good work.",
            isAiGenerated: false,
          });

          const { PUT } = await import("@/app/api/assessments/report/remarks/route");
          const req = makeReq(
            "http://localhost/api/assessments/report/remarks",
            "PUT",
            { periodId: "period-1", studentId: "s1", remark: "Well done." }
          );
          await PUT(req);

          const findFirstCalls = (prisma.student.findFirst as jest.Mock).mock.calls;
          expect(findFirstCalls.length).toBeGreaterThanOrEqual(1);
          for (const [args] of findFirstCalls) {
            expect(args?.where?.schoolId).toBe(schoolId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * For any non-empty schoolId, reportRemark.upsert create block uses
   * create.schoolId === user.schoolId.
   *
   * Validates: Requirements 12.1, 12.5
   */
  test("property: reportRemark.upsert create.schoolId always equals user.schoolId (20+ runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        async (schoolId) => {
          jest.clearAllMocks();

          const user = makeTeacherUser(schoolId);
          mockGetCurrentUser.mockResolvedValue(user);
          mockResolveActor.mockResolvedValue(
            makeActor(user) as Awaited<ReturnType<typeof resolveAssessmentActor>>
          );
          mockCanReportCard.mockReturnValue(true);

          (prisma.student.findFirst as jest.Mock).mockResolvedValue({
            id: "s1",
            classId: "class-1",
          });
          (prisma.reportRemark.upsert as jest.Mock).mockResolvedValue({
            draftRemark: null,
            editedRemark: "Good work.",
            isAiGenerated: false,
          });

          const { PUT } = await import("@/app/api/assessments/report/remarks/route");
          const req = makeReq(
            "http://localhost/api/assessments/report/remarks",
            "PUT",
            { periodId: "period-1", studentId: "s1", remark: "Well done." }
          );
          await PUT(req);

          const upsertCalls = (prisma.reportRemark.upsert as jest.Mock).mock.calls;
          expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
          for (const [args] of upsertCalls) {
            expect(args?.create?.schoolId).toBe(schoolId);
            // The where composite key must also carry schoolId
            expect(args?.where?.schoolId_periodId_studentId?.schoolId).toBe(schoolId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Concrete example: schoolId = "school-test-123"
   * - student.findFirst called with where: { id: studentId, schoolId: "school-test-123" }
   * - reportRemark.upsert called with create.schoolId = "school-test-123"
   *
   * Validates: Requirements 12.1, 12.5
   */
  test('concrete: schoolId "school-test-123" — student.findFirst and reportRemark.upsert use schoolId', async () => {
    const schoolId = "school-test-123";
    const studentId = "student-abc";
    const periodId = "period-1";
    const user = makeTeacherUser(schoolId);

    mockGetCurrentUser.mockResolvedValue(user);
    mockResolveActor.mockResolvedValue(
      makeActor(user) as Awaited<ReturnType<typeof resolveAssessmentActor>>
    );
    mockCanReportCard.mockReturnValue(true);

    (prisma.student.findFirst as jest.Mock).mockResolvedValue({
      id: studentId,
      classId: "class-1",
    });
    (prisma.reportRemark.upsert as jest.Mock).mockResolvedValue({
      draftRemark: null,
      editedRemark: "Great progress.",
      isAiGenerated: false,
    });

    const { PUT } = await import("@/app/api/assessments/report/remarks/route");
    const req = makeReq(
      "http://localhost/api/assessments/report/remarks",
      "PUT",
      { periodId, studentId, remark: "Great progress." }
    );
    const res = await PUT(req);

    expect(res.status).toBe(200);

    // student.findFirst must scope to correct school
    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: studentId,
          schoolId,
        }),
      })
    );

    // reportRemark.upsert must write schoolId into the create block
    expect(prisma.reportRemark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ schoolId }),
      })
    );
  });
});
