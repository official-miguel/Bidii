/**
 * GET    /api/staff/[id]/roles  — assigned + derived roles for a staff member
 * POST   /api/staff/[id]/roles  — assign a StaffRole (Principal only)
 * DELETE /api/staff/[id]/roles?roleId=...  — revoke a StaffRole (Principal only)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/apiAuth";
import { computeDerivedRolesByTeacherId } from "@/lib/derivedRoles";
import { logPermissionAudit } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId },
    select: {
      id: true, fullName: true, userId: true,
      departmentHeadOf:    { select: { id: true, name: true } },
      classTeacherOf:      { select: { id: true, name: true } },
      dormsBoardingMaster: { select: { id: true, name: true } },
      teacherSubjects:     { select: { subject: { select: { id: true, name: true } } } },
    },
  });
  if (!teacher) return NextResponse.json({ error: "Staff not found." }, { status: 404 });

  let assignedRoles: { id: string; name: string; assignedAt: string }[] = [];
  if (teacher.userId) {
    const rows = await prisma.userStaffRole.findMany({
      where: { userId: teacher.userId },
      include: { staffRole: { select: { id: true, name: true } } },
    });
    assignedRoles = rows.map((r) => ({
      id:         r.staffRole.id,
      name:       r.staffRole.name,
      assignedAt: r.assignedAt.toISOString(),
    }));
  }

  const derived = await computeDerivedRolesByTeacherId(teacher.id, schoolId);

  return NextResponse.json({
    teacherId: teacher.id,
    fullName:  teacher.fullName,
    assignedRoles,
    derivedRoles: {
      subjectTeacher: derived.subjectTeacher,
      classTeacher:   derived.classTeacher,
      headOfDept:     derived.headOfDept,
      dormMaster:     derived.dormMaster,
    },
    activeKinds: [...derived.activeKinds],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  const body = await req.json().catch(() => ({}));
  const { roleId } = body as { roleId?: string };
  if (!roleId) return NextResponse.json({ error: "roleId required." }, { status: 400 });

  const [teacher, role] = await Promise.all([
    prisma.teacher.findFirst({ where: { id: params.id, schoolId }, select: { userId: true, fullName: true } }),
    prisma.staffRole.findFirst({ where: { id: roleId, schoolId }, select: { name: true } }),
  ]);
  if (!teacher?.userId) return NextResponse.json({ error: "Staff member has no login account." }, { status: 400 });
  if (!role)            return NextResponse.json({ error: "Role not found." }, { status: 404 });

  await prisma.userStaffRole.upsert({
    where:  { userId_staffRoleId: { userId: teacher.userId, staffRoleId: roleId } },
    create: { userId: teacher.userId, staffRoleId: roleId, assignedById: user.id },
    update: {},
  });

  await logPermissionAudit({
    schoolId, performedById: user.id, targetUserId: teacher.userId, staffRoleId: roleId,
    action: "ROLE_ASSIGNED", changes: { roleName: role.name, staffName: teacher.fullName },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  const url    = new URL(req.url);
  const roleId = url.searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId required." }, { status: 400 });

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId },
    select: { userId: true, fullName: true },
  });
  if (!teacher?.userId) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });

  const role = await prisma.staffRole.findFirst({ where: { id: roleId, schoolId }, select: { name: true } });

  await prisma.userStaffRole.deleteMany({ where: { userId: teacher.userId, staffRoleId: roleId } });

  await logPermissionAudit({
    schoolId, performedById: user.id, targetUserId: teacher.userId, staffRoleId: roleId,
    action: "ROLE_UNASSIGNED", changes: { roleName: role?.name, staffName: teacher.fullName },
  });

  return NextResponse.json({ ok: true });
}
