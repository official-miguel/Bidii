/**
 * GET /api/staff-roles/[id]/validate?userId=...
 * Validates that a role assignment is complete — e.g. HOD requires a
 * department assignment, Dorm Master requires a dorm assignment.
 * Returns { valid: boolean, warnings: string[] }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const url    = new URL(req.url);
  const userId = url.searchParams.get("userId");

  const role = await prisma.staffRole.findFirst({
    where: { id: params.id, schoolId },
    select: { name: true },
  });
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  const warnings: string[] = [];
  const roleLower = role.name.toLowerCase();

  if (userId) {
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
      select: {
        departmentHeadOf:    { select: { id: true } },
        classTeacherOf:      { select: { id: true } },
        dormsBoardingMaster: { select: { id: true }, take: 1 },
      },
    }).catch(() => null);

    if (roleLower.includes("head of department") || roleLower.includes("hod")) {
      if (!teacher?.departmentHeadOf)
        warnings.push("Assign this staff member as HOD of a department first (Departments → edit department).");
    }
    if (roleLower.includes("class teacher")) {
      if (!teacher?.classTeacherOf)
        warnings.push("Assign this staff member as class teacher of a class first (Classes → edit class).");
    }
    if (roleLower.includes("boarding master") || roleLower.includes("matron")) {
      if (!teacher?.dormsBoardingMaster?.length)
        warnings.push("Assign this staff member to a dormitory first (Accommodation → edit dormitory).");
    }
  }

  return NextResponse.json({ valid: warnings.length === 0, warnings });
}
