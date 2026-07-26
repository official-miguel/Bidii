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

  // Fetch dormitories, per-dorm bed counts from SleepingPosition, and settings in parallel.
  const [dormitories, bedCountsByDorm, settings] = await Promise.all([
    prisma.dormitory.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        genderPolicy: true,
        status: true,
        allocationPolicy: true,
        structure: true,
        boardingMaster: { select: { fullName: true } },
      },
      orderBy: { name: "asc" },
    }),

    // Count total and occupied sleeping positions grouped by dorm.
    // SleepingPosition is the real unit of allocation — one position per student.
    prisma.sleepingPosition.groupBy({
      by: ["dormId"],
      where: { schoolId },
      _count: { _all: true },
    }).then(async (totals) => {
      const occupied = await prisma.sleepingPosition.groupBy({
        by: ["dormId"],
        where: { schoolId, isOccupied: true },
        _count: { _all: true },
      });
      const occupiedMap = new Map(occupied.map((r) => [r.dormId, r._count._all]));
      return new Map(
        totals.map((r) => [
          r.dormId,
          { total: r._count._all, occupied: occupiedMap.get(r.dormId) ?? 0 },
        ])
      );
    }),

    prisma.accommodationSettings.findUnique({ where: { schoolId } }),
  ]);

  const activeCount      = dormitories.filter((d) => d.status === "ACTIVE").length;
  const maintenanceCount = dormitories.filter((d) => d.status === "UNDER_MAINTENANCE").length;
  const closedCount      = dormitories.filter((d) => d.status === "CLOSED").length;
  const warningPct       = settings?.occupancyWarningPct ?? 90;

  const dormSummaries = dormitories.map((d) => {
    const beds     = bedCountsByDorm.get(d.id) ?? { total: 0, occupied: 0 };
    const capacity = beds.total;
    const occupied = beds.occupied;
    const available = Math.max(0, capacity - occupied);
    const pct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
    return {
      id: d.id,
      name: d.name,
      genderPolicy: d.genderPolicy,
      status: d.status,
      structure: d.structure,
      allocationPolicy: d.allocationPolicy,
      capacity,
      occupied,
      available,
      occupancyPct: pct,
      isAlmostFull: pct >= warningPct,
      boardingMasterName: d.boardingMaster?.fullName ?? null,
    };
  });

  // Top-level totals: all beds across all dorms (including maintenance/closed
  // so the "total" and "available" figures are accurate across every dorm.
  const totalPositions = dormSummaries.reduce((s, d) => s + d.capacity, 0);
  const totalOccupied  = dormSummaries.reduce((s, d) => s + d.occupied, 0);
  const availableInActive = dormSummaries.reduce((s, d) => s + d.available, 0);

  const boardingStudents = await prisma.allocationRecord.count({
    where: { schoolId, status: "CURRENT" },
  });

  return NextResponse.json({
    totalDormitories: dormitories.length,
    activeDormitories: activeCount,
    maintenanceDormitories: maintenanceCount,
    closedDormitories: closedCount,
    boardingStudents,
    totalSleepingPositions: totalPositions,
    occupiedPositions: totalOccupied,
    availablePositions: availableInActive,
    occupancyPct:
      totalPositions > 0
        ? Math.round((totalOccupied / totalPositions) * 100)
        : 0,
    dormSummaries,
    settings: settings ?? null,
  });
}
