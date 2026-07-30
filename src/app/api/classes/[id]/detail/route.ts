/**
 * GET /api/classes/[id]/detail
 *
 * Returns full class workspace data for the ClassWorkspaceDrawer:
 * class info, class teacher, subjects with assigned teachers,
 * and a preview of enrolled students (capped at 30 for performance).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("CLASSES", "view")) ??
    (await requirePermission("STUDENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      classTeacher: {
        select: { id: true, fullName: true, email: true },
      },
      subjectTeachers: {
        include: {
          subject: { select: { id: true, name: true, code: true, type: true } },
          teacher: { select: { id: true, fullName: true } },
        },
        orderBy: { subject: { name: "asc" } },
      },
      students: {
        where: { archivedAt: null },
        select: { id: true, fullName: true, admissionNumber: true },
        orderBy: { fullName: "asc" },
        take: 30,
      },
      _count: { select: { students: { where: { archivedAt: null } } } },
    },
  });

  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  return NextResponse.json(cls);
}
