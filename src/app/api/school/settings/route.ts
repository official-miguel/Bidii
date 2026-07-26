import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: {
      name: true,
      logoUrl: true,
      stampUrl: true,
      motto: true,
      boardingType: true,
      genderPolicy: true,
      autoAllocateDorms: true,
    },
  });

  return NextResponse.json(school ?? {});
}

// Accept full URLs (https://…) OR relative paths (/uploads/…) OR empty string to clear.
const urlOrRelative = z.string().trim().max(500).refine(
  (v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v),
  { message: "Must be a URL or a relative path starting with /" }
);

const updateSchema = z.object({
  motto:             z.string().trim().max(200).optional().or(z.literal("")),
  logoUrl:           urlOrRelative.optional(),
  stampUrl:          urlOrRelative.optional(),
  boardingType:      z.enum(["DAY_ONLY", "DAY_AND_BOARDING", "BOARDING_ONLY"]).optional(),
  genderPolicy:      z.enum(["MIXED", "BOYS_ONLY", "GIRLS_ONLY"]).optional(),
  autoAllocateDorms: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const school = await prisma.school.update({
    where: { id: user.schoolId },
    data: {
      ...(data.motto             !== undefined ? { motto:             data.motto             || null } : {}),
      ...(data.logoUrl           !== undefined ? { logoUrl:           data.logoUrl           || null } : {}),
      ...(data.stampUrl          !== undefined ? { stampUrl:          data.stampUrl          || null } : {}),
      ...(data.boardingType      !== undefined ? { boardingType:      data.boardingType            } : {}),
      ...(data.genderPolicy      !== undefined ? { genderPolicy:      data.genderPolicy            } : {}),
      ...(data.autoAllocateDorms !== undefined ? { autoAllocateDorms: data.autoAllocateDorms        } : {}),
    },
    select: {
      name: true,
      logoUrl: true,
      stampUrl: true,
      motto: true,
      boardingType: true,
      genderPolicy: true,
      autoAllocateDorms: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(school);
}
