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

/**
 * The dorm-management route handles complex operational actions that go
 * beyond simple CRUD. Each action is distinguished by the `action` field.
 *
 * Supported actions:
 *   TRANSFER_STUDENT       — move one student from their current dorm to another
 *   EMERGENCY_RELOCATION   — bulk-move all students out of a dorm
 *   MAINTENANCE_CLOSE      — set dorm status to UNDER_MAINTENANCE, optionally relocate occupants
 *   MAINTENANCE_REOPEN     — set dorm status back to ACTIVE
 *   BULK_REMOVE            — remove allocations from all students in a dorm
 *   STUDENT_REASSIGN       — change a student's cubicle/bed/position within the same dorm
 */

const transferSchema = z.object({
  action: z.literal("TRANSFER_STUDENT"),
  studentId: z.string().min(1),
  toDormId: z.string().min(1),
  toCubicleId: z.string().optional().nullable(),
  toSleepingPositionId: z.string().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const emergencySchema = z.object({
  action: z.literal("EMERGENCY_RELOCATION"),
  fromDormId: z.string().min(1),
  toDormId: z.string().min(1).optional().nullable(),
  reason: z.string().trim().min(1, "Reason is required for emergency relocation.").max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});

const maintenanceCloseSchema = z.object({
  action: z.literal("MAINTENANCE_CLOSE"),
  dormId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  notes: z.string().trim().max(500).optional().nullable(),
  relocateStudents: z.boolean().default(false),
  toDormId: z.string().optional().nullable(),
});

const maintenanceReopenSchema = z.object({
  action: z.literal("MAINTENANCE_REOPEN"),
  dormId: z.string().min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bulkRemoveSchema = z.object({
  action: z.literal("BULK_REMOVE"),
  dormId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});

const reassignSchema = z.object({
  action: z.literal("STUDENT_REASSIGN"),
  studentId: z.string().min(1),
  cubicleId: z.string().optional().nullable(),
  sleepingPositionId: z.string().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bodySchema = z.discriminatedUnion("action", [
  transferSchema,
  emergencySchema,
  maintenanceCloseSchema,
  maintenanceReopenSchema,
  bulkRemoveSchema,
  reassignSchema,
]);

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // ── TRANSFER_STUDENT ────────────────────────────────────────────────────
  if (data.action === "TRANSFER_STUDENT") {
    const { studentId, toDormId, toCubicleId, toSleepingPositionId, reason, notes } = data;

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId },
    });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const toDorm = await prisma.dormitory.findFirst({
      where: { id: toDormId, schoolId: user.schoolId },
      include: { permittedForms: true },
    });
    if (!toDorm) return NextResponse.json({ error: "Destination dormitory not found." }, { status: 404 });
    if (toDorm.status !== "ACTIVE") {
      return NextResponse.json({ error: "Destination dormitory is not active." }, { status: 409 });
    }

    // Capacity check
    const currentOccupancy = await prisma.allocationRecord.count({
      where: { dormId: toDormId, status: "CURRENT", schoolId: user.schoolId },
    });
    if (toDorm.totalCapacity > 0 && currentOccupancy >= toDorm.totalCapacity) {
      return NextResponse.json({ error: "Destination dormitory is at full capacity." }, { status: 409 });
    }

    // Check sleeping position availability
    if (toSleepingPositionId) {
      const pos = await prisma.sleepingPosition.findFirst({
        where: { id: toSleepingPositionId, dormId: toDormId, schoolId: user.schoolId },
      });
      if (!pos) return NextResponse.json({ error: "Sleeping position not found." }, { status: 404 });
      if (pos.isOccupied) {
        return NextResponse.json({ error: "That sleeping position is already occupied." }, { status: 409 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Vacate existing
      const existing = await tx.allocationRecord.findFirst({
        where: { studentId, schoolId: user.schoolId, status: "CURRENT" },
      });

      let fromDormId: string | null = null;
      if (existing) {
        fromDormId = existing.dormId;
        await tx.allocationRecord.update({
          where: { id: existing.id },
          data: { status: "TRANSFERRED", vacatedDate: new Date(), notes: reason ?? notes ?? null },
        });
        if (existing.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: existing.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
      }

      // Create new allocation
      const allocation = await tx.allocationRecord.create({
        data: {
          schoolId: user.schoolId,
          studentId,
          dormId: toDormId,
          cubicleId: toCubicleId ?? null,
          sleepingPositionId: toSleepingPositionId ?? null,
          notes: notes ?? null,
          allocatedById: user.id,
          status: "CURRENT",
        },
      });

      if (toSleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: toSleepingPositionId },
          data: { isOccupied: true },
        });
      }

      return { allocation, fromDormId };
    });

    return NextResponse.json({
      success: true,
      action: "TRANSFER_STUDENT",
      allocationId: result.allocation.id,
      fromDormId: result.fromDormId,
      toDormId,
    });
  }

  // ── EMERGENCY_RELOCATION ────────────────────────────────────────────────
  if (data.action === "EMERGENCY_RELOCATION") {
    const { fromDormId, toDormId, reason, notes } = data;

    const fromDorm = await prisma.dormitory.findFirst({
      where: { id: fromDormId, schoolId: user.schoolId },
    });
    if (!fromDorm) return NextResponse.json({ error: "Source dormitory not found." }, { status: 404 });

    // Get all current occupants
    const currentAllocations = await prisma.allocationRecord.findMany({
      where: { dormId: fromDormId, status: "CURRENT", schoolId: user.schoolId },
    });

    let relocated = 0;

    await prisma.$transaction(async (tx) => {
      for (const alloc of currentAllocations) {
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "VACATED",
            vacatedDate: new Date(),
            notes: `Emergency relocation: ${reason}`,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }

        // Optionally move to destination dorm
        if (toDormId) {
          await tx.allocationRecord.create({
            data: {
              schoolId: user.schoolId,
              studentId: alloc.studentId,
              dormId: toDormId,
              notes: notes ?? `Emergency relocation from ${fromDorm.name}: ${reason}`,
              allocatedById: user.id,
              status: "CURRENT",
            },
          });
        }

        relocated++;
      }

      // Set source dorm under maintenance
      await tx.dormitory.update({
        where: { id: fromDormId },
        data: { status: "UNDER_MAINTENANCE" },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "EMERGENCY_RELOCATION",
      relocated,
      fromDormId,
      toDormId: toDormId ?? null,
    });
  }

  // ── MAINTENANCE_CLOSE ───────────────────────────────────────────────────
  if (data.action === "MAINTENANCE_CLOSE") {
    const { dormId, reason, notes, relocateStudents, toDormId } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId: user.schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

    let relocated = 0;

    await prisma.$transaction(async (tx) => {
      if (relocateStudents) {
        const currentAllocations = await tx.allocationRecord.findMany({
          where: { dormId, status: "CURRENT", schoolId: user.schoolId },
        });
        for (const alloc of currentAllocations) {
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: {
              status: "VACATED",
              vacatedDate: new Date(),
              notes: `Maintenance closure: ${reason}`,
            },
          });
          if (alloc.sleepingPositionId) {
            await tx.sleepingPosition.update({
              where: { id: alloc.sleepingPositionId },
              data: { isOccupied: false },
            });
          }
          if (toDormId) {
            await tx.allocationRecord.create({
              data: {
                schoolId: user.schoolId,
                studentId: alloc.studentId,
                dormId: toDormId,
                notes: notes ?? `Relocated from ${dorm.name} due to maintenance`,
                allocatedById: user.id,
                status: "CURRENT",
              },
            });
          }
          relocated++;
        }
      }

      await tx.dormitory.update({
        where: { id: dormId },
        data: { status: "UNDER_MAINTENANCE", description: notes ?? dorm.description },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "MAINTENANCE_CLOSE",
      dormId,
      relocated,
    });
  }

  // ── MAINTENANCE_REOPEN ──────────────────────────────────────────────────
  if (data.action === "MAINTENANCE_REOPEN") {
    const { dormId, notes } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId: user.schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

    await prisma.dormitory.update({
      where: { id: dormId },
      data: {
        status: "ACTIVE",
        ...(notes ? { description: notes } : {}),
      },
    });

    return NextResponse.json({ success: true, action: "MAINTENANCE_REOPEN", dormId });
  }

  // ── BULK_REMOVE ─────────────────────────────────────────────────────────
  if (data.action === "BULK_REMOVE") {
    const { dormId, reason, notes } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId: user.schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

    const currentAllocations = await prisma.allocationRecord.findMany({
      where: { dormId, status: "CURRENT", schoolId: user.schoolId },
    });

    let removed = 0;

    await prisma.$transaction(async (tx) => {
      for (const alloc of currentAllocations) {
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "VACATED",
            vacatedDate: new Date(),
            notes: notes ?? reason,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
        removed++;
      }
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "BULK_REMOVE",
      dormId,
      removed,
    });
  }

  // ── STUDENT_REASSIGN ────────────────────────────────────────────────────
  if (data.action === "STUDENT_REASSIGN") {
    const { studentId, cubicleId, sleepingPositionId, notes } = data;

    const current = await prisma.allocationRecord.findFirst({
      where: { studentId, schoolId: user.schoolId, status: "CURRENT" },
    });
    if (!current) {
      return NextResponse.json({ error: "Student has no current accommodation." }, { status: 404 });
    }

    if (sleepingPositionId) {
      const pos = await prisma.sleepingPosition.findFirst({
        where: { id: sleepingPositionId, dormId: current.dormId, schoolId: user.schoolId },
      });
      if (!pos) return NextResponse.json({ error: "Sleeping position not found in this dorm." }, { status: 404 });
      if (pos.isOccupied && sleepingPositionId !== current.sleepingPositionId) {
        return NextResponse.json({ error: "That sleeping position is already occupied." }, { status: 409 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Free old position
      if (current.sleepingPositionId && current.sleepingPositionId !== sleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: current.sleepingPositionId },
          data: { isOccupied: false },
        });
      }

      await tx.allocationRecord.update({
        where: { id: current.id },
        data: {
          cubicleId: cubicleId !== undefined ? cubicleId : current.cubicleId,
          sleepingPositionId: sleepingPositionId !== undefined ? sleepingPositionId : current.sleepingPositionId,
          notes: notes ?? current.notes,
        },
      });

      if (sleepingPositionId && sleepingPositionId !== current.sleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: sleepingPositionId },
          data: { isOccupied: true },
        });
      }
    });

    return NextResponse.json({ success: true, action: "STUDENT_REASSIGN", studentId });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
