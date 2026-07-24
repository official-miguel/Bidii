import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("SUBJECTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { teacherSubjects: true } },
    },
  });
  return NextResponse.json(subjects);
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters.")
    .max(10, "Code should be short, e.g. MTH.")
    .transform((s) => s.toUpperCase()),
  type: z.enum(["CORE", "ELECTIVE"]),
  departmentId: z.string().min(1, "Choose a department."),
  applicableForms: z.array(z.number().int().min(1).max(6)).min(1, "Select at least one form."),
  // Inputs for the AI Timetable Generator — optional so existing callers
  // (and the API in general) keep working with just sensible defaults.
  lessonsPerWeek: z.number().int().min(1).max(20).default(5),
  doubleLesson: z.boolean().default(false),
  requiresSpecialRoom: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  // The department must belong to this school too, or a principal could
  // hang a subject off another school's department by guessing its id.
  const department = await prisma.department.findFirst({
    where: { id: parsed.data.departmentId, schoolId: user.schoolId },
  });
  if (!department) {
    return NextResponse.json({ error: "Choose a valid department." }, { status: 400 });
  }

  try {
    const subject = await prisma.subject.create({
      data: {
        ...parsed.data,
        requiresSpecialRoom: parsed.data.requiresSpecialRoom || null,
        schoolId: user.schoolId,
      },
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A subject with that code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create subject." }, { status: 500 });
  }
}
