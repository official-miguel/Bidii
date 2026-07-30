/**
 * /api/timetable/elective-groups/[groupId]/members
 *
 * POST   — add a subject to a group
 * DELETE — remove a subject from a group  (body: { subjectId })
 *
 * Rules enforced here:
 *  • Subject must be type ELECTIVE.
 *  • Subject must be applicable to the group's scopeForm (or school-wide group).
 *  • A subject may belong to more than one group — no uniqueness cross-group.
 *  • Within the same group a subject can only appear once (DB unique constraint).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function auth() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"))
  );
}

// ── POST — add subject ─────────────────────────────────────────────────────

const addSchema = z.object({ subjectId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const { subjectId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId: user.schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Verify subject belongs to school and is ELECTIVE
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId },
  });
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }
  if (subject.type !== "ELECTIVE") {
    return NextResponse.json(
      { error: `"${subject.name}" is not an elective subject and cannot be added to a group.` },
      { status: 422 },
    );
  }

  // Validate the subject applies to the group's form scope
  if (
    group.scopeForm > 0 &&
    subject.applicableForms.length > 0 &&
    !subject.applicableForms.includes(group.scopeForm)
  ) {
    return NextResponse.json(
      {
        error: `"${subject.name}" does not apply to Form ${group.scopeForm}. Check the subject's applicable forms.`,
      },
      { status: 422 },
    );
  }

  // Already in this group?
  const existing = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
  });
  if (existing) {
    return NextResponse.json(
      { error: `"${subject.name}" is already in this group.` },
      { status: 409 },
    );
  }

  const member = await prisma.electiveGroupMember.create({
    data: { id: generateId(), groupId, subjectId },
    include: {
      subject: { select: { id: true, code: true, name: true, internalCode: true } },
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}

// ── DELETE — remove subject ────────────────────────────────────────────────

const removeSchema = z.object({ subjectId: z.string().min(1) });

export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const { subjectId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId: user.schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const member = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
  });
  if (!member) {
    return NextResponse.json({ error: "Subject is not in this group" }, { status: 404 });
  }

  await prisma.electiveGroupMember.delete({ where: { id: member.id } });

  return NextResponse.json({ ok: true });
}

// ── Tiny ID generator (avoids importing cuid2 just for this) ───────────────
function generateId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
