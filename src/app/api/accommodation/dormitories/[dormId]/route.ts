import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"))
  );
}
async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId: user.schoolId },
    include: {
      permittedForms: true,
      boardingMaster: { select: { id: true, fullName: true, staffId: true } },
      dormCaptain: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true } },
        },
      },
      cubicles: {
        orderBy: { name: "asc" },
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
      },
      beds: {
        where: { cubicleId: null }, // top-level beds (OPEN_HALL or uncubicled)
        orderBy: { label: "asc" },
        include: {
          positions: {
            include: {
              allocations: {
                where: { status: "CURRENT" },
                include: {
                  student: {
                    select: {
                      id: true,
                      fullName: true,
                      admissionNumber: true,
                      schoolClass: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          allocations: { where: { status: "CURRENT" } },
          sleepingPositions: true,
        },
      },
    },
  });

  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  return NextResponse.json(dorm);
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  genderPolicy: z.enum(["BOYS_ONLY", "GIRLS_ONLY", "MIXED"]).optional(),
  structure: z.enum(["OPEN_HALL", "CUBICLE_BASED"]).optional(),
  status: z.enum(["ACTIVE", "UNDER_MAINTENANCE", "CLOSED"]).optional(),
  allocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]).optional(),
  cubiclesInheritPolicy: z.boolean().optional(),
  description: z.string().trim().max(500).optional().nullable(),
  boardingMasterId: z.string().optional().nullable(),
  dormCaptainId: z.string().optional().nullable(),
  permittedForms: z.array(z.coerce.number().int().min(1).max(12)).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId: user.schoolId },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { permittedForms, ...rest } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (permittedForms !== undefined) {
      await tx.dormPermittedForm.deleteMany({ where: { dormId: params.dormId } });
      if (permittedForms.length > 0) {
        await tx.dormPermittedForm.createMany({
          data: permittedForms.map((form) => ({ dormId: params.dormId, form })),
        });
      }
    }

    return tx.dormitory.update({
      where: { id: params.dormId },
      data: {
        ...rest,
        boardingMasterId: rest.boardingMasterId ?? undefined,
        dormCaptainId: rest.dormCaptainId ?? undefined,
      },
      include: {
        permittedForms: true,
        boardingMaster: { select: { id: true, fullName: true, staffId: true } },
        dormCaptain: { select: { id: true, fullName: true, admissionNumber: true } },
      },
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId: user.schoolId },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  if (dorm._count.allocations > 0) {
    return NextResponse.json(
      { error: "Cannot delete a dormitory with active student allocations. Deallocate all students first." },
      { status: 409 }
    );
  }

  await prisma.dormitory.delete({ where: { id: params.dormId } });
  return NextResponse.json({ success: true });
}
