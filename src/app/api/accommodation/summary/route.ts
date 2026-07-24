import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"))
  );
}

export async function GET() {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { schoolId } = user;

  // Parallel fetches for dashboard summary
  const [dormitories, totalPositions, occupiedPositions, settings] =
    await Promise.all([
      prisma.dormitory.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          genderPolicy: true,
          status: true,
          totalCapacity: true,
          allocationPolicy: true,
          structure: true,
          boardingMaster: { select: { fullName: true } },
          _count: {
            select: {
              allocations: { where: { status: "CURRENT" } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.sleepingPosition.count({ where: { schoolId } }),
      prisma.sleepingPosition.count({ where: { schoolId, isOccupied: true } }),
      prisma.accommodationSettings.findUnique({ where: { schoolId } }),
    ]);

  const activeCount = dormitories.filter((d) => d.status === "ACTIVE").length;
  const maintenanceCount = dormitories.filter(
    (d) => d.status === "UNDER_MAINTENANCE"
  ).length;
  const closedCount = dormitories.filter((d) => d.status === "CLOSED").length;

  const boardingStudents = await prisma.allocationRecord.count({
    where: { schoolId, status: "CURRENT" },
  });

  const dormSummaries = dormitories.map((d) => {
    const occupied = d._count.allocations;
    const capacity = d.totalCapacity;
    const pct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
    const warningPct = settings?.occupancyWarningPct ?? 90;
    return {
      id: d.id,
      name: d.name,
      genderPolicy: d.genderPolicy,
      status: d.status,
      structure: d.structure,
      allocationPolicy: d.allocationPolicy,
      capacity,
      occupied,
      available: Math.max(0, capacity - occupied),
      occupancyPct: pct,
      isAlmostFull: pct >= warningPct,
      boardingMasterName: d.boardingMaster?.fullName ?? null,
    };
  });

  return NextResponse.json({
    totalDormitories: dormitories.length,
    activeDormitories: activeCount,
    maintenanceDormitories: maintenanceCount,
    closedDormitories: closedCount,
    boardingStudents,
    totalSleepingPositions: totalPositions,
    occupiedPositions,
    availablePositions: Math.max(0, totalPositions - occupiedPositions),
    occupancyPct:
      totalPositions > 0
        ? Math.round((occupiedPositions / totalPositions) * 100)
        : 0,
    dormSummaries,
    settings: settings ?? null,
  });
}
