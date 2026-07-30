/**
 * /api/timetable/elective-groups
 *
 * GET    — list all groups for the school, optionally filtered by scopeForm
 * POST   — create a new elective group
 * PATCH  — update name / lessonsPerWeek  (body must include id)
 * DELETE — remove a group               (body must include id)
 *
 * scopeForm = 0  → school-wide
 * scopeForm = N  → Form N only
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

// ── Auth helper ────────────────────────────────────────────────────────────

async function auth(req: NextRequest) {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"))
  );
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scopeFormParam = searchParams.get("scopeForm");

  const where: any = { schoolId: user.schoolId };
  if (scopeFormParam !== null) {
    where.scopeForm = Number(scopeFormParam);
  }

  const groups = await prisma.electiveGroup.findMany({
    where,
    include: {
      members: {
        include: {
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
              internalCode: true,
            },
          },
        },
        orderBy: { subject: { name: "asc" } },
      },
    },
    orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ groups });
}

// ── POST ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:          z.string().min(1).max(50),
  scopeForm:     z.number().int().min(0),
  lessonsPerWeek: z.number().int().min(1).max(20),
});

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, scopeForm, lessonsPerWeek } = parsed.data;

  // Check uniqueness
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
    data: { schoolId: user.schoolId, name, scopeForm, lessonsPerWeek },
    include: { members: { include: { subject: { select: { id: true, code: true, name: true, internalCode: true } } } } },
  });

  return NextResponse.json({ group }, { status: 201 });
}

// ── PATCH ──────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  id:             z.string().min(1),
  name:           z.string().min(1).max(50).optional(),
  lessonsPerWeek: z.number().int().min(1).max(20).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id, name, lessonsPerWeek } = parsed.data;

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
      ...(name !== undefined ? { name } : {}),
      ...(lessonsPerWeek !== undefined ? { lessonsPerWeek } : {}),
    },
    include: {
      members: {
        include: { subject: { select: { id: true, code: true, name: true, internalCode: true } } },
        orderBy: { subject: { name: "asc" } },
      },
    },
  });

  return NextResponse.json({ group: updated });
}

// ── DELETE ─────────────────────────────────────────────────────────────────

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Group id required" }, { status: 400 });
  }

  const group = await prisma.electiveGroup.findFirst({
    where: { id: parsed.data.id, schoolId: user.schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // ElectiveGroupMember rows cascade-delete via FK
  await prisma.electiveGroup.delete({ where: { id: parsed.data.id } });

  return NextResponse.json({ ok: true });
}
