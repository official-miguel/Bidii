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

    const created = await prisma.$transaction(
      cubicleNames.map((name) =>
        prisma.cubicle.create({
          data: {
            dormId: params.dormId,
            schoolId: user.schoolId,
            name,
            capacity: capacityEach,
          },
        })
      )
    );

    return NextResponse.json({ created: created.length, cubicles: created }, { status: 201 });
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

  const cubicle = await prisma.cubicle.create({
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

  return NextResponse.json(cubicle, { status: 201 });
}
