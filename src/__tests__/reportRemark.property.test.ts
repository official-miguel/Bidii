/**
 * Property tests for report remark persistence round-trip.
 *
 * Covers:
 *   Property 14: Report remark persistence round-trip — the PUT endpoint saves
 *                editedRemark and the returned response includes editedRemark
 *                exactly as passed (no truncation, encoding, or mutation).
 *                Validates: Requirements 8.5
 */

import * as fc from "fast-check";

// ---- Mocks (must come before imports) ----------------------------------------
jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    student: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    reportRemark: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/assessment/auth844", () => ({
  resolveAssessmentActor: jest.fn(),
  canGenerateReportCard: jest.fn(),
}));

jest.mock("@/lib/ai/gemini", () => ({
  callGemini: jest.fn(),
  AiServiceError: class AiServiceError extends Error {},
}));

// ---- Imports -----------------------------------------------------------------
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveAssessmentActor,
  canGenerateReportCard,
} from "@/lib/assessment/auth844";
import { prisma } from "@/lib/prisma";

const mockGetCurrentUser    = getCurrentUser    as jest.MockedFunction<typeof getCurrentUser>;
const mockResolveActor      = resolveAssessmentActor as jest.MockedFunction<typeof resolveAssessmentActor>;
const mockCanGenerateReport = canGenerateReportCard  as jest.MockedFunction<typeof canGenerateReportCard>;

// Cast to `any` to access the db-proxy methods (same pattern the route uses)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---- Helpers -----------------------------------------------------------------

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/assessments/report/remarks", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PRINCIPAL_USER = {
  id: "user-1",
  role: "PRINCIPAL",
  schoolId: "school-1",
  isActive: true,
  staffRoleId: null,
} as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const MOCK_STUDENT = { id: "student-1", classId: "class-1" };

const MOCK_ACTOR = {
  user: PRINCIPAL_USER,
  teacher: null,
  roles: [],
  isPrincipal: true,
  classTeacherOfId: null,
  adminCanView: false,
  adminCanManage: false,
};

// ---- Setup -------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default happy-path mocks
  mockGetCurrentUser.mockResolvedValue(PRINCIPAL_USER);
  db.student.findFirst.mockResolvedValue(MOCK_STUDENT);
  mockResolveActor.mockResolvedValue(
    MOCK_ACTOR as ReturnType<typeof resolveAssessmentActor> extends Promise<infer T> ? T : never
  );
  mockCanGenerateReport.mockReturnValue(true);
});

// ============================================================================
// Property 14 — Report remark persistence round-trip
// **Validates: Requirements 8.5**
// ============================================================================

describe("Property 14 — Report remark persistence round-trip", () => {
  test("PUT returns the exact remark string passed in (property: arbitrary Unicode strings)", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    /**
     * Arbitrary remark: any Unicode string up to 500 chars including
     * emojis, whitespace, newlines, and special characters.
     */
    const remarkArb = fc.string({ minLength: 0, maxLength: 500 });

    await fc.assert(
      fc.asyncProperty(remarkArb, async (remark) => {
        // The upsert mock returns editedRemark exactly as passed
        db.reportRemark.upsert.mockResolvedValue({
          draftRemark: null,
          editedRemark: remark,
          isAiGenerated: false,
        });

        const req = makePutRequest({
          periodId: "period-1",
          studentId: "student-1",
          remark,
        });

        const res = await PUT(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        // The round-trip invariant: response editedRemark === input remark
        expect(body.editedRemark).toBe(remark);
      }),
      { numRuns: 100 }
    );
  });

  // ---- Example-based tests --------------------------------------------------

  test("PUT with valid payload returns 200 with correct studentId, periodId, editedRemark", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    const remark = "John has shown great improvement this term.";

    db.reportRemark.upsert.mockResolvedValue({
      draftRemark: null,
      editedRemark: remark,
      isAiGenerated: false,
    });

    const req = makePutRequest({
      periodId: "period-1",
      studentId: "student-1",
      remark,
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.studentId).toBe("student-1");
    expect(body.periodId).toBe("period-1");
    expect(body.editedRemark).toBe(remark);
  });

  test("PUT without remark field returns 400", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    const req = makePutRequest({
      periodId: "period-1",
      studentId: "student-1",
      // remark intentionally omitted
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  test("PUT without periodId returns 400", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    const req = makePutRequest({
      studentId: "student-1",
      remark: "Some remark",
      // periodId intentionally omitted
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  test("PUT without studentId returns 400", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    const req = makePutRequest({
      periodId: "period-1",
      remark: "Some remark",
      // studentId intentionally omitted
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  test("PUT with unauthenticated request returns 401", async () => {
    const { PUT } = await import("@/app/api/assessments/report/remarks/route");

    mockGetCurrentUser.mockResolvedValue(null);

    const req = makePutRequest({
      periodId: "period-1",
      studentId: "student-1",
      remark: "Some remark",
    });

    const res = await PUT(req);
    expect(res.status).toBe(401);
  });
});
