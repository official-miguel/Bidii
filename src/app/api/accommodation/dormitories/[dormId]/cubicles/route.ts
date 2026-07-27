import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Cubicle name is required.").max(50),
  capacity: z.coerce.number().int().min(1).max(100).default(4),
  allocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]).nullable().optional(),
  description: z.string().trim().max(300).optional().nullable(),
  permittedForms: z.array(z.coerce.number().int().min(1).max(12)).default([]),
});

const bulkCreateSchema = z.object({
  mode: z.enum(["bulk", "auto"]),
  // bulk: provide array of names
  names: z.array(z.string().trim().min(1)).optional(),
  // auto: generate N cubicles with a prefix
  count: z.coerce.number().int().min(1).max(200).optional(),
  prefix: z.string().trim().max(20).optional(),
  capacityEach: z.coerce.number().int().min(1).max(100).default(4),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cubicles = await prisma.cubicle.findMany({
    where: { dormId: params.dormId, schoolId: user.schoolId },
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
  });

  return NextResponse.json(cubicles);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  // Detect bulk vs single
  if (body?.mode === "bulk" || body?.mode === "auto") {
    const parsed = bulkCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input." },
        { status: 400 }
      );
    }

    const { mode, names, count, prefix, capacityEach } = parsed.data;

    let cubicleNames: string[] = [];
    if (mode === "bulk" && names && names.length > 0) {
      cubicleNames = names;
    } else if (mode === "auto" && count) {
      const p = prefix?.trim() || "Cubicle ";
      cubicleNames = Array.from({ length: count }, (_, i) => `${p}${i + 1}`);
    }

    if (cubicleNames.length === 0) {
      return NextResponse.json({ error: "No cubicle names provided." }, { status: 400 });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Create all cubicles first
        const cubicles = await Promise.all(
          cubicleNames.map((name) =>
            tx.cubicle.create({
              data: {
                dormId: params.dormId,
                schoolId: user.schoolId,
                name,
                capacity: capacityEach,
              },
            })
          )
        );

        // For each cubicle, auto-generate beds based on capacity
        for (const cubicle of cubicles) {
          for (let i = 1; i <= capacityEach; i++) {
            const bed = await tx.bed.create({
              data: {
                dormId: params.dormId,
                cubicleId: cubicle.id,
                schoolId: user.schoolId,
                label: `${cubicle.name} - Bed ${i}`,
                bedType: "SINGLE",
              },
            });

            // Create a single sleeping position for each bed
            await tx.sleepingPosition.create({
              data: {
                bedId: bed.id,
                dormId: params.dormId,
                cubicleId: cubicle.id,
                schoolId: user.schoolId,
                position: null,
              },
            });
          }
        }

        // Update dorm's totalCapacity
        const positionCount = await tx.sleepingPosition.count({
          where: { dormId: params.dormId },
        });
        await tx.dormitory.update({
          where: { id: params.dormId },
          data: { totalCapacity: positionCount },
        });

        return cubicles;
      });

      return NextResponse.json({ created: created.length, cubicles: created }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "One or more cubicle names already exist in this dormitory. Choose a different prefix or remove the existing cubicles first." },
          { status: 409 }
        );
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        return NextResponse.json(
          { error: "Dormitory not found or does not belong to your school." },
          { status: 404 }
        );
      }
      console.error("[POST /cubicles] bulk create error:", err);
      return NextResponse.json({ error: "Failed to create cubicles. Please try again." }, { status: 500 });
    }
  }

  // Single cubicle
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { name, capacity, allocationPolicy, description, permittedForms } =
    parsed.data;

  const existing = await prisma.cubicle.findUnique({
    where: { dormId_name: { dormId: params.dormId, name } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A cubicle named "${name}" already exists in this dormitory.` },
      { status: 409 }
    );
  }

  try {
    const cubicle = await prisma.$transaction(async (tx) => {
      // Create the cubicle
      const newCubicle = await tx.cubicle.create({
        data: {
          dormId: params.dormId,
          schoolId: user.schoolId,
          name,
          capacity,
          allocationPolicy: allocationPolicy ?? null,
          description,
          permittedForms:
            allocationPolicy === "RESTRICTED_BY_FORM" && permittedForms.length > 0
              ? { create: permittedForms.map((form) => ({ form })) }
              : undefined,
        },
        include: { permittedForms: true },
      });

      // Auto-generate beds based on capacity
      for (let i = 1; i <= capacity; i++) {
        const bed = await tx.bed.create({
          data: {
            dormId: params.dormId,
            cubicleId: newCubicle.id,
            schoolId: user.schoolId,
            label: `${newCubicle.name} - Bed ${i}`,
            bedType: "SINGLE",
          },
        });

        // Create a single sleeping position for each bed
        await tx.sleepingPosition.create({
          data: {
            bedId: bed.id,
            dormId: params.dormId,
            cubicleId: newCubicle.id,
            schoolId: user.schoolId,
            position: null,
          },
        });
      }

      // Update dorm's totalCapacity
      const positionCount = await tx.sleepingPosition.count({
        where: { dormId: params.dormId },
      });
      await tx.dormitory.update({
        where: { id: params.dormId },
        data: { totalCapacity: positionCount },
      });

      return newCubicle;
    });

    return NextResponse.json(cubicle, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `A cubicle named "${name}" already exists in this dormitory.` },
        { status: 409 }
      );
    }
    console.error("[POST /cubicles] single create error:", err);
    return NextResponse.json({ error: "Failed to create cubicle. Please try again." }, { status: 500 });
  }
}
