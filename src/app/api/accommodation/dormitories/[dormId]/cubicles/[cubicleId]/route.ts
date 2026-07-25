import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

const patchSchema = z.object({
  name:     z.string().trim().min(1).max(50).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { dormId: string; cubicleId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cubicle = await prisma.cubicle.findFirst({
    where: { id: params.cubicleId, dormId: params.dormId, schoolId: user.schoolId },
  });
  if (!cubicle) return NextResponse.json({ error: "Cubicle not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { name, capacity } = parsed.data;

  // If renaming, make sure the new name doesn't clash with another cubicle in the same dorm
  if (name && name !== cubicle.name) {
    const clash = await prisma.cubicle.findUnique({
      where: { dormId_name: { dormId: params.dormId, name } },
    });
    if (clash) {
      return NextResponse.json(
        { error: `A cubicle named "${name}" already exists in this dormitory.` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.cubicle.update({
    where: { id: params.cubicleId },
    data: {
      ...(name     !== undefined ? { name }     : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    },
    include: {
      permittedForms: true,
      _count: {
        select: {
          beds: true,
          sleepingPositions: true,
          allocations: { where: { status: "CURRENT" } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { dormId: string; cubicleId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cubicle = await prisma.cubicle.findFirst({
    where: { id: params.cubicleId, dormId: params.dormId, schoolId: user.schoolId },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  if (!cubicle) return NextResponse.json({ error: "Cubicle not found." }, { status: 404 });

  if (cubicle._count.allocations > 0) {
    return NextResponse.json(
      { error: "Cannot delete a cubicle with active student allocations. Remove them first." },
      { status: 409 }
    );
  }

  await prisma.cubicle.delete({ where: { id: params.cubicleId } });
  return NextResponse.json({ success: true });
}
