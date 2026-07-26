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

const schema = z.object({
  dormId: z.string().min(1, "Dormitory is required."),
  cubicleId: z.string().optional().nullable(),
  // Explicit list of student IDs
  studentIds: z.array(z.string()).optional(),
  // OR filter-based selection
  filter: z
    .object({
      forms: z.array(z.number().int().min(1).max(12)).optional(),
      classIds: z.array(z.string()).optional(),
      unallocatedOnly: z.boolean().optional(),
      admissionYear: z.number().int().optional(),
    })
    .optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  allocationDate: z.string().optional().nullable(),
});

/**
 * POST /api/accommodation/bulk-allocate
 *
 * Allocates multiple students to a dormitory at once, assigning each student
 * to a specific free SleepingPosition so that bed-level occupancy is kept
 * accurate in the UI.
 *
 * Accepts either an explicit list of studentIds OR a filter object.
 * Rules:
 *  - Only students from the school are processed
 *  - Dorm form rules are enforced
 *  - Free sleeping positions are checked before the transaction; if insufficient
 *    space exists the request is rejected with 409
 *  - Existing CURRENT allocations are vacated and replaced
 */
export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { dormId, cubicleId, studentIds, filter, notes, allocationDate } = parsed.data;

  // ── Verify dorm ────────────────────────────────────────────────────────────
  const dorm = await prisma.dormitory.findFirst({
    where: { id: dormId, schoolId: user.schoolId },
    include: { permittedForms: true },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });
  if (dorm.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Cannot allocate to a dormitory that is not active." },
      { status: 409 }
    );
  }

  // ── Resolve student IDs ────────────────────────────────────────────────────
  let targetStudentIds: string[] = studentIds ?? [];

  if (!targetStudentIds.length && filter) {
    const { forms, classIds, unallocatedOnly, admissionYear } = filter;

    const whereClause: Record<string, unknown> = {
      schoolId: user.schoolId,
      archivedAt: null,
    };

    if (forms && forms.length > 0) {
      whereClause.schoolClass = { form: { in: forms } };
    }
    if (classIds && classIds.length > 0) {
      whereClause.classId = { in: classIds };
    }
    if (admissionYear) {
      const yearStart = new Date(`${admissionYear}-01-01T00:00:00Z`);
      const yearEnd = new Date(`${admissionYear + 1}-01-01T00:00:00Z`);
      whereClause.createdAt = { gte: yearStart, lt: yearEnd };
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      select: {
        id: true,
        accommodationAllocations: unallocatedOnly
          ? { where: { status: "CURRENT" }, select: { id: true } }
          : undefined,
      },
    });

    targetStudentIds = students
      .filter((s) => !unallocatedOnly || s.accommodationAllocations?.length === 0)
      .map((s) => s.id);
  }

  if (targetStudentIds.length === 0) {
    return NextResponse.json({ error: "No students match the given criteria." }, { status: 400 });
  }

  // ── Enforce form restrictions ──────────────────────────────────────────────
  if (
    dorm.allocationPolicy === "RESTRICTED_BY_FORM" &&
    dorm.permittedForms.length > 0
  ) {
    const allowedForms = dorm.permittedForms.map((f) => f.form);
    const studentsWithForms = await prisma.student.findMany({
      where: { id: { in: targetStudentIds }, schoolId: user.schoolId },
      select: { id: true, schoolClass: { select: { form: true } } },
    });
    const violating = studentsWithForms.filter(
      (s) => !allowedForms.includes(s.schoolClass.form)
    );
    if (violating.length > 0) {
      return NextResponse.json(
        {
          error: `${violating.length} student(s) are from forms not permitted in this dormitory. Permitted forms: ${allowedForms.join(", ")}.`,
          violatingIds: violating.map((s) => s.id),
        },
        { status: 409 }
      );
    }
  }

  // ── Load free sleeping positions ───────────────────────────────────────────
  // Filter to the requested cubicle when one is specified.
  const freePositions = await prisma.sleepingPosition.findMany({
    where: {
      schoolId: user.schoolId,
      dormId,
      isOccupied: false,
      ...(cubicleId ? { cubicleId } : {}),
    },
    select: { id: true, bedId: true, cubicleId: true },
    orderBy: { id: "asc" },
  });

  // Students already in this exact dorm don't need a new position slot counted
  // against capacity (they'll vacate their current one then take a new one).
  // But we still need one free position per student being newly assigned.
  // Simple approach: check we have enough free positions for all target students.
  const alreadyInDorm = await prisma.allocationRecord.findMany({
    where: { studentId: { in: targetStudentIds }, dormId, status: "CURRENT" },
    select: { studentId: true, sleepingPositionId: true },
  });
  const alreadyInDormIds = new Set(alreadyInDorm.map((r) => r.studentId));
  const newStudents = targetStudentIds.filter((id) => !alreadyInDormIds.has(id));

  // For students already in this dorm, their current position will be freed
  // before a new one is taken, so available = freePositions + their positions.
  // Conservatively just check total free >= net new positions needed.
  const positionsNeeded = newStudents.length;
  if (freePositions.length < positionsNeeded) {
    return NextResponse.json(
      {
        error: `Insufficient capacity. ${freePositions.length} space(s) available${cubicleId ? " in this cubicle" : ""}, but ${positionsNeeded} new student(s) need allocation.`,
        available: freePositions.length,
        requested: positionsNeeded,
      },
      { status: 409 }
    );
  }

  // ── Execute bulk allocation in a transaction ───────────────────────────────
  const allocDate = allocationDate ? new Date(allocationDate) : new Date();
  const results: { studentId: string; success: boolean; error?: string }[] = [];

  // Use a queue of free positions — popped one per student
  const posQueue = [...freePositions];

  await prisma.$transaction(
    async (tx) => {
      for (const studentId of targetStudentIds) {
        try {
          // Vacate existing current allocation
          const existing = await tx.allocationRecord.findFirst({
            where: { studentId, schoolId: user.schoolId, status: "CURRENT" },
          });

          if (existing) {
            await tx.allocationRecord.update({
              where: { id: existing.id },
              data: { status: "TRANSFERRED", vacatedDate: new Date() },
            });
            // Free the old sleeping position so it's available for others
            if (existing.sleepingPositionId) {
              await tx.sleepingPosition.update({
                where: { id: existing.sleepingPositionId },
                data: { isOccupied: false },
              });
              // If this student was already in this dorm, their freed position
              // goes back into the queue so it can be reused
              if (existing.dormId === dormId) {
                posQueue.push({
                  id: existing.sleepingPositionId,
                  bedId: existing.bedId ?? "",
                  cubicleId: existing.cubicleId ?? null,
                });
              }
            }
          }

          // Grab the next free position
          const pos = posQueue.shift();
          if (!pos) {
            results.push({ studentId, success: false, error: "No sleeping position available." });
            continue;
          }

          // Create new allocation with specific bed + position
          await tx.allocationRecord.create({
            data: {
              schoolId: user.schoolId,
              studentId,
              dormId,
              cubicleId: pos.cubicleId ?? cubicleId ?? null,
              bedId: pos.bedId || null,
              sleepingPositionId: pos.id,
              notes: notes ?? null,
              allocatedById: user.id,
              allocationDate: allocDate,
              status: "CURRENT",
            },
          });

          // Mark sleeping position as occupied
          await tx.sleepingPosition.update({
            where: { id: pos.id },
            data: { isOccupied: true },
          });

          results.push({ studentId, success: true });
        } catch (err) {
          results.push({
            studentId,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    },
    { timeout: 30_000 }
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    allocated: succeeded,
    failed,
    total: targetStudentIds.length,
    results,
  });
}
