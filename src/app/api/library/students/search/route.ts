import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("LIBRARY", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);

  const students = await prisma.student.findMany({
    where: {
      schoolId: user.schoolId,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { admissionNumber: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: 10,
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      schoolClass: { select: { name: true } },
      libraryCard: {
        select: {
          id: true,
          fineBalance: true,
          totalFinesPaid: true,
        },
      },
    },
  });

  return NextResponse.json(students);
}
