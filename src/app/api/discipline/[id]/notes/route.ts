import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";

const schema = z.object({ body: z.string().trim().min(1, "Write a note first.") });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  try {
    const note = await prisma.disciplineNote.create({
      data: { disciplineRecordId: record.id, body: parsed.data.body, createdById: user.id },
    });
    await prisma.disciplineEvent.create({
      data: { disciplineRecordId: record.id, type: "NOTE", detail: "Note added", createdById: user.id },
    });
    return NextResponse.json(note, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't add the note." }, { status: 500 });
  }
}
