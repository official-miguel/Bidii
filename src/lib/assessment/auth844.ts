/**
 * Server-only assessment auth utility for the 8-4-4 framework.
 * Import only inside Server Components and API route handlers.
 *
 * NOTE: AssessmentRole and AssessmentRoleType come from @prisma/client only
 * after `prisma generate` has been run against the current schema. Until then
 * we define compatible inline types so the file compiles cleanly.
 */

import { prisma } from "@/lib/prisma";
import type { User, Module } from "@prisma/client";

// ---------------------------------------------------------------------------
// Inline types that mirror the Prisma-generated ones.
// Replace with imports from "@prisma/client" once `prisma generate` succeeds.
// ---------------------------------------------------------------------------

type AssessmentRoleType =
  | "SUBJECT_TEACHER"
  | "CLASS_TEACHER"
  | "HOD"
  | "EXAM_OFFICER"
  | "DIRECTOR"
  | "PARENT_VIEWER";

interface AssessmentRoleRow {
  id: string;
  role: AssessmentRoleType;
  subjectId: string | null;
  learningAreaId: string | null;
  competencyUnitId: string | null;
  frameworkId: string;
  teacherId: string;
  schoolId: string;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AssessmentActor {
  user: User;
  /** Minimal teacher shape — only fields we actually read. */
  teacher: { id: string } | null;
  roles: AssessmentRoleRow[];
  isPrincipal: boolean;
  /** classId that this teacher is the class teacher of (null if none). */
  classTeacherOfId: string | null;
  adminCanView: boolean;
  adminCanManage: boolean;
}

// ---------------------------------------------------------------------------
// resolveAssessmentActor
// ---------------------------------------------------------------------------

export async function resolveAssessmentActor(
  user: User,
  schoolId: string
): Promise<AssessmentActor> {
  // Find the active 8-4-4 framework for this school.
  const framework = await (prisma as any).assessmentFramework.findFirst({ // eslint-disable-line @typescript-eslint/no-explicit-any
    where: { schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  // For ADMIN_STAFF, check module permissions.
  let adminCanView = false;
  let adminCanManage = false;
  if (user.role === "ADMIN_STAFF" && user.staffRoleId) {
    const perm = await prisma.rolePermission.findUnique({
      where: {
        staffRoleId_module: {
          staffRoleId: user.staffRoleId,
          module: "ASSESSMENTS" as Module,
        },
      },
    });
    adminCanView = perm?.canView ?? false;
    adminCanManage = perm?.canManage ?? false;
  }

  // Fetch the teacher row (minimal select — only what we need).
  const teacherRow = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      classTeacherOf: { select: { id: true } },
    },
  });

  const classTeacherOfId = teacherRow?.classTeacherOf?.id ?? null;

  if (!framework) {
    return {
      user,
      teacher: teacherRow ? { id: teacherRow.id } : null,
      roles: [],
      isPrincipal: user.role === "PRINCIPAL",
      classTeacherOfId,
      adminCanView,
      adminCanManage,
    };
  }

  // Fetch assessment roles for this teacher in this framework.
  const roles: AssessmentRoleRow[] = teacherRow
    ? await (prisma as any).assessmentRole.findMany({ // eslint-disable-line @typescript-eslint/no-explicit-any
        where: { teacherId: teacherRow.id, frameworkId: framework.id },
      }) as AssessmentRoleRow[]
    : [];

  return {
    user,
    teacher: teacherRow ? { id: teacherRow.id } : null,
    roles,
    isPrincipal: user.role === "PRINCIPAL",
    classTeacherOfId,
    adminCanView,
    adminCanManage,
  };
}

// ---------------------------------------------------------------------------
// Role-check helpers
// ---------------------------------------------------------------------------

function hasRole(actor: AssessmentActor, ...types: AssessmentRoleType[]): boolean {
  return actor.roles.some((r) => types.includes(r.role));
}

function hasRoleForSubject(
  actor: AssessmentActor,
  role: AssessmentRoleType,
  subjectId: string
): boolean {
  return actor.roles.some(
    (r) => r.role === role && (r.subjectId === subjectId || r.subjectId === null)
  );
}

// ---------------------------------------------------------------------------
// Public guard functions
// ---------------------------------------------------------------------------

export function canEnterMarks(actor: AssessmentActor, subjectId: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId !== null && hasRole(actor, "CLASS_TEACHER")) return true;
  if (hasRoleForSubject(actor, "SUBJECT_TEACHER", subjectId)) return true;
  return false;
}

export function canViewMarksheet(actor: AssessmentActor, subjectId?: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId !== null && hasRole(actor, "CLASS_TEACHER")) return true;
  if (subjectId && hasRoleForSubject(actor, "SUBJECT_TEACHER", subjectId)) return true;
  if (subjectId) {
    const isHodForSubject = actor.roles.some(
      (r) => r.role === "HOD" && (r.subjectId === subjectId || r.subjectId === null)
    );
    if (isHodForSubject) return true;
  } else {
    if (hasRole(actor, "HOD")) return true;
  }
  return false;
}

export function canAccessDashboard(actor: AssessmentActor): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER", "HOD")) return true;
  return false;
}

export function canGenerateReportCard(actor: AssessmentActor, classId: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId === classId && hasRole(actor, "CLASS_TEACHER")) return true;
  return false;
}

export function canReadPeriods(actor: AssessmentActor): boolean {
  return canViewMarksheet(actor) || canAccessDashboard(actor);
}
