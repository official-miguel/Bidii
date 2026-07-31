/**
 * /api/timetable/elective-groups
 *
 * GET    — list all groups for the school, optionally filtered by scopeForm.
 *          Each group now includes its scopeStreams and the full list of
 *          teacher-subject pairings (ElectiveGroupTeacher rows).
 * POST   — create a new elective group (accepts scopeStreams)
 * PATCH  — update name / lessonsPerWeek / scopeStreams  (body must include id)
 * DELETE — remove a group  (body must include id)
 *
 * scopeForm = 0  → school-wide
 * scopeForm = N  → Form N only
 *
 * scopeStreams = []        → all streams in the form
 * scopeStreams = ["North"] → only the named streams
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

// ── Auth helper ────────────────────────────────────────────────────────────

async function auth() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"))
  );
}

// ── Shared include for full group shape ────────────────────────────────────

const groupInclude = {
  members: {
    include: {
      subject: {
        select: { id: true, code: true, name: true, internalCode: true },
      },
    },
    orderBy: { subject: { name: "asc" } },
  },
  teachers: {
    include: {
      subject: { select: { id: true, code: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: [
      { subject: { name: "asc" } },
      { teacher: { fullName: "asc" } },
    ],
  },
} as const;

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scopeFormParam = searchParams.get("scopeForm");

  const where: Record<string, unknown> = { schoolId: user.schoolId };
  if (scopeFormParam !== null) {
    where.scopeForm = Number(scopeFormParam);
  }

  const groups = await prisma.electiveGroup.findMany({
    where,
    include: groupInclude,
    orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ groups });
}

// ── POST ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:           z.string().min(1).max(50),
  scopeForm:      z.number().int().min(0),
  lessonsPerWeek: z.number().int().min(1).max(20),
  /// Optional: restrict the group to specific stream names within the form.
  /// Omitting the field (or passing []) means the group applies to all streams.
  scopeStreams:   z.array(z.string().min(1)).optional().default([]),
});

export async function POST(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, scopeForm, lessonsPerWeek, scopeStreams } = parsed.data;

  // Check uniqueness (name + scopeForm pair)
  const existing = await prisma.electiveGroup.findFirst({
    where: { schoolId: user.schoolId, name, scopeForm },
  });
  if (existing) {
    const scope = scopeForm === 0 ? "school-wide" : `Form ${scopeForm}`;
    return NextResponse.json(
      { error: `A group named "${name}" already exists for ${scope}.` },
      { status: 409 },
    );
  }

  const group = await prisma.electiveGroup.create({
    data: { schoolId: user.schoolId, name, scopeForm, lessonsPerWeek, scopeStreams },
    include: groupInclude,
  });

  return NextResponse.json({ group }, { status: 201 });
}

// ── PATCH ──────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  id:             z.string().min(1),
  name:           z.string().min(1).max(50).optional(),
  lessonsPerWeek: z.number().int().min(1).max(20).optional(),
  /// Pass an explicit array (even []) to update; omit the key to leave unchanged.
  scopeStreams:   z.array(z.string().min(1)).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id, name, lessonsPerWeek, scopeStreams } = parsed.data;

  const group = await prisma.electiveGroup.findFirst({
    where: { id, schoolId: user.schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Name-uniqueness check on rename
  if (name && name !== group.name) {
    const clash = await prisma.electiveGroup.findFirst({
      where: { schoolId: user.schoolId, name, scopeForm: group.scopeForm, id: { not: id } },
    });
    if (clash) {
      const scope = group.scopeForm === 0 ? "school-wide" : `Form ${group.scopeForm}`;
      return NextResponse.json(
        { error: `A group named "${name}" already exists for ${scope}.` },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.electiveGroup.update({
    where: { id },
    data: {
      ...(name            !== undefined ? { name }            : {}),
      ...(lessonsPerWeek  !== undefined ? { lessonsPerWeek }  : {}),
      ...(scopeStreams     !== undefined ? { scopeStreams }    : {}),
    },
    include: groupInclude,
  });

  return NextResponse.json({ group: updated });
}

// ── DELETE ─────────────────────────────────────────────────────────────────

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Group id required" }, { status: 400 });
  }

  const group = await prisma.electiveGroup.findFirst({
    where: { id: parsed.data.id, schoolId: user.schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // ElectiveGroupMember and ElectiveGroupTeacher rows cascade-delete via FK
  await prisma.electiveGroup.delete({ where: { id: parsed.data.id } });

  return NextResponse.json({ ok: true });
}
