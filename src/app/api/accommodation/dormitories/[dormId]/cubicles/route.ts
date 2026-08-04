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
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional(),
});

const bulkCreateSchema = z.object({
  mode: z.enum(["bulk", "auto"]),
  // bulk: provide array of names
  names: z.array(z.string().trim().min(1)).optional(),
  // auto: generate N cubicles with a prefix
  count: z.coerce.number().int().min(1).max(200).optional(),
  prefix: z.string().trim().max(20).optional(),
  capacityEach: z.coerce.number().int().min(1).max(100).default(4),
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional(),
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

  // Transform to ensure counts are properly formatted
  const result = cubicles.map((c) => ({
    ...c,
    _count: {
      ...c._count,
      // Ensure sleepingPositions count is visible
      sleepingPositions: c._count.sleepingPositions,
      allocations: c._count.allocations,
    },
  }));

  return NextResponse.json(result);
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

    const { mode, names, count, prefix, capacityEach, bedType, customOccupancy } = parsed.data;

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

    // Get positions per bed
    function getPositionsPerBed(type: string, customOcc: number | undefined) {
      if (type === "DOUBLE_DECKER") return 2;
      if (type === "CUSTOM") return Math.max(1, customOcc || 1);
      return 1; // SINGLE
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Continue bed numbering from highest existing
        const lastBed = await tx.bed.findFirst({
          where: { dormId: params.dormId },
          orderBy: { createdAt: "desc" },
        });
        let nextBedNumber = 1;
        if (lastBed && lastBed.label) {
          // Extract number from label like "Bed 42"
          const match = lastBed.label.match(/Bed (\d+)/);
          if (match) {
            nextBedNumber = parseInt(match[1]) + 1;
          }
        }

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
        // For each cubicle, auto-generate beds based on capacity and bed type
        for (const cubicle of cubicles) {
          for (let i = 1; i <= capacityEach; i++) {
            const bed = await tx.bed.create({
              data: {
                dormId: params.dormId,
                cubicleId: cubicle.id,
                schoolId: user.schoolId,
                label: `Bed ${nextBedNumber}`,
                bedType,
                customOccupancy: bedType === "CUSTOM" ? (customOccupancy || 1) : null,
              },
            });
            nextBedNumber++;

            // Create sleeping positions based on bed type
            const positionsCount = getPositionsPerBed(bedType, customOccupancy);
            if (bedType === "DOUBLE_DECKER") {
              // Create UPPER and LOWER positions
              await tx.sleepingPosition.create({
                data: {
                  bedId: bed.id,
                  dormId: params.dormId,
                  cubicleId: cubicle.id,
                  schoolId: user.schoolId,
                  position: "UPPER",
                },
              });
              await tx.sleepingPosition.create({
                data: {
                  bedId: bed.id,
                  dormId: params.dormId,
                  cubicleId: cubicle.id,
                  schoolId: user.schoolId,
                  position: "LOWER",
                },
              });
            } else if (bedType === "CUSTOM") {
              // Create N positions with numeric labels
              for (let j = 1; j <= positionsCount; j++) {
                await tx.sleepingPosition.create({
                  data: {
                    bedId: bed.id,
                    dormId: params.dormId,
                    cubicleId: cubicle.id,
                    schoolId: user.schoolId,
                    position: null,
                    customLabel: `Space ${j}`,
                  },
                });
              }
            } else {
              // SINGLE bed - one position with null position
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
        }

        // Update dorm's totalCapacity
        const positionCount = await tx.sleepingPosition.count({
          where: { dormId: params.dormId },
        });
        await tx.dormitory.update({
          where: { id: params.dormId },
          data: { totalCapacity: positionCount },
        });

        // Fetch cubicles with counts for response
        const createdWithCounts = await tx.cubicle.findMany({
          where: { id: { in: cubicles.map(c => c.id) } },
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

        return createdWithCounts;
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Failed to create cubicles: ${errorMsg}` }, { status: 500 });
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

  const { name, capacity, allocationPolicy, description, permittedForms, bedType, customOccupancy } =
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

  // Get positions per bed
  function getPositionsPerBed(type: string, customOcc: number | undefined) {
    if (type === "DOUBLE_DECKER") return 2;
    if (type === "CUSTOM") return Math.max(1, customOcc || 1);
    return 1; // SINGLE
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
      });

      // Continue bed numbering from highest existing
      const lastBed = await tx.bed.findFirst({
        where: { dormId: params.dormId },
        orderBy: { createdAt: "desc" },
      });
      let nextBedNumber = 1;
      if (lastBed && lastBed.label) {
        // Extract number from label like "Bed 42"
        const match = lastBed.label.match(/Bed (\d+)/);
        if (match) {
          nextBedNumber = parseInt(match[1]) + 1;
        }
      }

      for (let i = 1; i <= capacity; i++) {
        const bed = await tx.bed.create({
          data: {
            dormId: params.dormId,
            cubicleId: newCubicle.id,
            schoolId: user.schoolId,
            label: `Bed ${nextBedNumber}`,
            bedType,
            customOccupancy: bedType === "CUSTOM" ? (customOccupancy || 1) : null,
          },
        });
        nextBedNumber++;

        // Create sleeping positions based on bed type
        const positionsCount = getPositionsPerBed(bedType, customOccupancy);
        if (bedType === "DOUBLE_DECKER") {
          // Create UPPER and LOWER positions
          await tx.sleepingPosition.create({
            data: {
              bedId: bed.id,
              dormId: params.dormId,
              cubicleId: newCubicle.id,
              schoolId: user.schoolId,
              position: "UPPER",
            },
          });
          await tx.sleepingPosition.create({
            data: {
              bedId: bed.id,
              dormId: params.dormId,
              cubicleId: newCubicle.id,
              schoolId: user.schoolId,
              position: "LOWER",
            },
          });
        } else if (bedType === "CUSTOM") {
          // Create N positions with numeric labels
          for (let j = 1; j <= positionsCount; j++) {
            await tx.sleepingPosition.create({
              data: {
                bedId: bed.id,
                dormId: params.dormId,
                cubicleId: newCubicle.id,
                schoolId: user.schoolId,
                position: null,
                customLabel: `Space ${j}`,
              },
            });
          }
        } else {
          // SINGLE bed - one position with null position
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
      }

      // Update dorm's totalCapacity
      const positionCount = await tx.sleepingPosition.count({
        where: { dormId: params.dormId },
      });
      await tx.dormitory.update({
        where: { id: params.dormId },
        data: { totalCapacity: positionCount },
      });

      // Fetch with full counts for response
      const result = await tx.cubicle.findUnique({
        where: { id: newCubicle.id },
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

      return result;
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create cubicle: ${errorMsg}` }, { status: 500 });
  }
}
