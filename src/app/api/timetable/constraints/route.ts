import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseTimetableConstraint } from "@/lib/ai/constraintParser";

export async function GET() {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const constraints = await prisma.aiTimetableConstraint.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(constraints);
}

const schema = z.object({ instruction: z.string().trim().min(3, "Say a bit more.") });

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const [subjects, config] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId: user.schoolId }, select: { code: true, name: true } }),
    prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
  ]);

  // Never fails the request even if Gemini is down/misconfigured — the
  // instruction is still saved (as a GENERIC constraint carrying the raw
  // text), the Principal just won't get the AI's structured interpretation
  // for it until they retry.
  const parsedConstraint = await parseTimetableConstraint(
    user.schoolId,
    parsed.data.instruction,
    subjects,
    config?.periodsPerDay ?? 8
  );

  const constraint = await prisma.aiTimetableConstraint.create({
    data: {
      schoolId: user.schoolId,
      instruction: parsed.data.instruction,
      parsed: parsedConstraint as unknown as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json(constraint, { status: 201 });
}
