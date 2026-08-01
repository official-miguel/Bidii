import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

type Ctx = { params: { id: string } };

async function ownsVersion(versionId: string, schoolId: string) {
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${versionId} AND "schoolId" = ${schoolId}
  `;
  return rows[0] ?? null;
}

// ── GET /api/timetable/v2/versions/[id]/slots ─────────────────────────────
// Returns all slots for this version, with subject/teacher names resolved.

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await ownsVersion(params.id, user.schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const classId = req.nextUrl.searchParams.get("classId");
  const teacherId = req.nextUrl.searchParams.get("teacherId");

  const slots = await prisma.$queryRaw<
    Array<{
      id: string; classId: string; className: string;
      dayOfWeek: number; period: number;
      subjectId: string; subjectCode: string; subjectName: string;
      teacherId: string; teacherName: string;
      room: string | null; isManual: boolean; notes: string | null;
    }>
  >`
    SELECT
      s.id, s."classId", c.name AS "className",
      s."dayOfWeek", s.period,
      s."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
      s."teacherId", t."fullName" AS "teacherName",
      s.room, s."isManual", s.notes
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass"  c   ON c.id = s."classId"
    JOIN "Subject"      sub ON sub.id = s."subjectId"
    JOIN "Teacher"      t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}
    ${classId   ? Prisma.sql`AND s."classId"   = ${classId}`   : Prisma.empty}
    ${teacherId ? Prisma.sql`AND s."teacherId" = ${teacherId}` : Prisma.empty}
    ORDER BY s."dayOfWeek", s.period, c.name
  `;

  return NextResponse.json(slots);
}

// ── POST /api/timetable/v2/versions/[id]/slots ────────────────────────────
// Adds a single slot to a DRAFT version with full conflict checking.

const addSchema = z.object({
  classId:   z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  period:    z.number().int().min(1).max(16),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  room:      z.string().trim().max(80).nullable().optional(),
  notes:     z.string().trim().max(200).nullable().optional(),
  isManual:  z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await ownsVersion(params.id, user.schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot modify an archived version." }, { status: 409 });

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  let d = parsed.data;

  // Handle group subjects: convert GROUP_<id> back to anchor subject ID
  let groupId: string | null = null;
  let isGroupSubject = false;
  if (d.subjectId.startsWith("GROUP_")) {
    isGroupSubject = true;
    groupId = d.subjectId.substring(6); // Remove GROUP_ prefix
    // Get the anchor subject ID (first member of the group)
    const group = await prisma.electiveGroup.findUnique({
      where: { id: groupId },
      select: {
        members: { select: { subjectId: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!group?.members[0])
      return NextResponse.json({ error: "Group not found or has no members." }, { status: 400 });
    d = { ...d, subjectId: group.members[0].subjectId };
  }

  // Verify the class belongs to this school
  const classCheck = await prisma.schoolClass.findFirst({
    where: { id: d.classId, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!classCheck) return NextResponse.json({ error: "Class not found." }, { status: 400 });

  // For group subjects, use a placeholder teacher (actual teachers are in ClassElectiveGroupTeacher)
  // For regular subjects, validate the teacher assignment
  if (isGroupSubject && d.teacherId === "GROUP_PLACEHOLDER") {
    // Group subjects don't need teacher validation here
    // Teachers are assigned per subject within the group via ClassElectiveGroupTeacher
    // For now, use the first available teacher or create a system placeholder
    const anyTeacher = await prisma.teacher.findFirst({
      where: { schoolId: user.schoolId },
      select: { id: true },
    });
    if (!anyTeacher) {
      return NextResponse.json({ error: "No teachers found in school." }, { status: 400 });
    }
    d = { ...d, teacherId: anyTeacher.id };
  } else {
    // Regular subject - validate teacher assignment
    const teacherCheck = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: d.teacherId,
        subjectId: d.subjectId,
        teacher: { schoolId: user.schoolId },
      },
      select: { teacherId: true },
    });

    if (!teacherCheck)
      return NextResponse.json({ error: "That teacher is not assigned to this subject." }, { status: 400 });
  }

  // Check class conflict
  const classConflict = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id} AND "classId" = ${d.classId}
      AND "dayOfWeek" = ${d.dayOfWeek} AND period = ${d.period}
  `;
  if (classConflict.length > 0)
    return NextResponse.json({ error: "This class already has a lesson in that slot." }, { status: 409 });

  // Check teacher conflict
  const teacherConflict = await prisma.$queryRaw<Array<{ id: string; classId: string }>>`
    SELECT vs.id, vs."classId" FROM "TimetableVersionSlot" vs
    WHERE vs."versionId" = ${params.id} AND vs."teacherId" = ${d.teacherId}
      AND vs."dayOfWeek" = ${d.dayOfWeek} AND vs.period = ${d.period}
  `;
  if (teacherConflict.length > 0) {
    const clashClass = await prisma.schoolClass.findFirst({
      where: { id: teacherConflict[0].classId },
      select: { name: true },
    });
    return NextResponse.json({
      error: `This teacher is already teaching ${clashClass?.name ?? "another class"} in that slot.`,
    }, { status: 409 });
  }

  const slotId = randomUUID();
  const now    = new Date();

  await prisma.$executeRaw`
    INSERT INTO "TimetableVersionSlot"
      (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
       "subjectId", "teacherId", room, "isManual", notes, "createdAt", "updatedAt")
    VALUES (
      ${slotId}, ${params.id}, ${user.schoolId}, ${d.classId},
      ${d.dayOfWeek}, ${d.period}, ${d.subjectId}, ${d.teacherId},
      ${d.room ?? null}, ${d.isManual ?? true}, ${d.notes ?? null},
      ${now}, ${now}
    )
  `;

  const afterSnap = { classId: d.classId, subjectId: d.subjectId, teacherId: d.teacherId,
    dayOfWeek: d.dayOfWeek, period: d.period, room: d.room ?? null };

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", "slotId", action, "changeSource",
       "afterState", detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId}, ${params.id}, ${slotId},
      'SLOT_ADDED'::"TimetableChangeAction", 'MANUAL',
      ${JSON.stringify(afterSnap)}::jsonb,
      ${JSON.stringify({ classId: d.classId, dayOfWeek: d.dayOfWeek, period: d.period })}::jsonb,
      ${user.id}, ${now}
    )
  `;

  const newSlot = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.*, sub.code AS "subjectCode", sub.name AS "subjectName",
           t."fullName" AS "teacherName", c.name AS "className"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s.id = ${slotId}
  `;

  return NextResponse.json(newSlot[0], { status: 201 });
}

// ── DELETE /api/timetable/v2/versions/[id]/slots ──────────────────────────
// Removes a slot by slotId query param.

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await ownsVersion(params.id, user.schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot modify an archived version." }, { status: 409 });

  const slotId = req.nextUrl.searchParams.get("slotId");
  if (!slotId) return NextResponse.json({ error: "slotId is required." }, { status: 400 });

  await prisma.$executeRaw`
    DELETE FROM "TimetableVersionSlot"
    WHERE id = ${slotId} AND "versionId" = ${params.id}
  `;

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId}, ${params.id},
      'SLOT_REMOVED'::"TimetableChangeAction",
      ${JSON.stringify({ slotId })}::jsonb,
      ${user.id}, ${new Date()}
    )
  `;

  return NextResponse.json({ ok: true });
}
