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
  /** List of dorm IDs to distribute students across. If empty, uses all ACTIVE dorms. */
  dormIds: z.array(z.string()).optional(),
  /** Filter students to auto-allocate */
  filter: z
    .object({
      forms: z.array(z.number().int().min(1).max(12)).optional(),
      classIds: z.array(z.string()).optional(),
      unallocatedOnly: z.boolean().default(true),
    })
    .optional(),
  /** Strategy: FILL_FIRST fills each dorm before moving on; DISTRIBUTE_EVENLY spreads students */
  strategy: z.enum(["FILL_FIRST", "DISTRIBUTE_EVENLY"]).default("DISTRIBUTE_EVENLY"),
  /** Only perform a dry run — return what would be allocated without writing */
  dryRun: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/accommodation/auto-allocate
 *
 * Automatically distributes students across dormitories according to each
 * dorm's configured rules (gender policy, form restrictions, capacity).
 *
 * Returns a preview (plan) when dryRun=true, or executes allocations when false.
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

  const { dormIds, filter, strategy, dryRun, notes } = parsed.data;

  // Resolve target dorms
  const dormQuery = dormIds && dormIds.length > 0 ? { id: { in: dormIds } } : {};
  const dorms = await prisma.dormitory.findMany({
    where: { ...dormQuery, schoolId: user.schoolId, status: "ACTIVE" },
    include: {
      permittedForms: true,
      _count: { select: { allocations: { where: { status: "CURRENT" } } } },
    },
    orderBy: { name: "asc" },
  });

  if (dorms.length === 0) {
    return NextResponse.json({ error: "No active dormitories available." }, { status: 400 });
  }

  // Resolve students to allocate
  const studentWhere: Record<string, unknown> = {
    schoolId: user.schoolId,
    archivedAt: null,
  };
  if (filter?.forms && filter.forms.length > 0) {
    studentWhere.schoolClass = { form: { in: filter.forms } };
  }
  if (filter?.classIds && filter.classIds.length > 0) {
    studentWhere.classId = { in: filter.classIds };
  }

  const allStudents = await prisma.student.findMany({
    where: studentWhere,
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      schoolClass: { select: { name: true, form: true } },
      accommodationAllocations: {
        where: { status: "CURRENT" },
        select: { dormId: true },
        take: 1,
      },
    },
    orderBy: { fullName: "asc" },
  });

  const studentsToAllocate =
    filter?.unallocatedOnly !== false
      ? allStudents.filter((s) => s.accommodationAllocations.length === 0)
      : allStudents;

  if (studentsToAllocate.length === 0) {
    return NextResponse.json({
      message: "No students require allocation.",
      allocated: 0,
      unplaceable: 0,
      plan: [],
    });
  }

  // Build allocation plan
  type PlanEntry = {
    studentId: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    dormId: string;
    dormName: string;
    reason?: string;
  };

  const plan: PlanEntry[] = [];
  const unplaceable: Array<{ studentId: string; studentName: string; reason: string }> = [];

  // Track available capacity per dorm (mutable during planning)
  const dormCapacity: Map<
    string,
    { dorm: (typeof dorms)[0]; available: number }
  > = new Map();
  for (const d of dorms) {
    const occ = d._count.allocations;
    const avail = Math.max(0, d.totalCapacity - occ);
    dormCapacity.set(d.id, { dorm: d, available: avail });
  }

  for (const student of studentsToAllocate) {
    const studentForm = student.schoolClass.form;

    // Find eligible dorms for this student
    const eligible = dorms.filter((d) => {
      const cap = dormCapacity.get(d.id);
      if (!cap || cap.available <= 0) return false;

      // Form restriction check
      if (
        d.allocationPolicy === "RESTRICTED_BY_FORM" &&
        d.permittedForms.length > 0
      ) {
        if (!d.permittedForms.some((pf) => pf.form === studentForm)) return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      unplaceable.push({
        studentId: student.id,
        studentName: student.fullName,
        reason: `No eligible dormitory with available capacity for Form ${studentForm}`,
      });
      continue;
    }

    // Choose dorm based on strategy
    let chosenDorm: (typeof dorms)[0];
    if (strategy === "FILL_FIRST") {
      // Sort by least available (most occupied) first
      eligible.sort((a, b) => {
        const ca = dormCapacity.get(a.id)!.available;
        const cb = dormCapacity.get(b.id)!.available;
        return ca - cb;
      });
      chosenDorm = eligible[0];
    } else {
      // DISTRIBUTE_EVENLY — sort by most available
      eligible.sort((a, b) => {
        const ca = dormCapacity.get(a.id)!.available;
        const cb = dormCapacity.get(b.id)!.available;
        return cb - ca;
      });
      chosenDorm = eligible[0];
    }

    plan.push({
      studentId: student.id,
      studentName: student.fullName,
      admissionNumber: student.admissionNumber,
      className: student.schoolClass.name,
      dormId: chosenDorm.id,
      dormName: chosenDorm.name,
    });

    // Reduce available capacity
    const cap = dormCapacity.get(chosenDorm.id)!;
    cap.available -= 1;
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      toAllocate: plan.length,
      unplaceable: unplaceable.length,
      plan,
      unplaceableStudents: unplaceable,
    });
  }

  // Execute the plan
  const allocDate = new Date();
  let allocated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const entry of plan) {
        // Vacate existing
        const existing = await tx.allocationRecord.findFirst({
          where: { studentId: entry.studentId, schoolId: user.schoolId, status: "CURRENT" },
        });
        if (existing) {
          await tx.allocationRecord.update({
            where: { id: existing.id },
            data: { status: "TRANSFERRED", vacatedDate: new Date() },
          });
          if (existing.sleepingPositionId) {
            await tx.sleepingPosition.update({
              where: { id: existing.sleepingPositionId },
              data: { isOccupied: false },
            });
          }
        }

        await tx.allocationRecord.create({
          data: {
            schoolId: user.schoolId,
            studentId: entry.studentId,
            dormId: entry.dormId,
            notes: notes ?? `Auto-allocated (${strategy.replace("_", " ").toLowerCase()})`,
            allocatedById: user.id,
            allocationDate: allocDate,
            status: "CURRENT",
          },
        });

        allocated++;
      }
    },
    { timeout: 60_000 }
  );

  return NextResponse.json({
    dryRun: false,
    allocated,
    unplaceable: unplaceable.length,
    plan,
    unplaceableStudents: unplaceable,
  });
}
