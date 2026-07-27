import { prisma } from "@/lib/prisma";

/**
 * Checks if a school has active dormitories with free sleeping positions.
 * Returns the count of free positions available for allocation.
 */
export async function checkDormAvailability(schoolId: string): Promise<{
  hasDormitories: boolean;
  freePositionsCount: number;
  activeDormsCount: number;
}> {
  const [dormCount, freePositions] = await Promise.all([
    prisma.dormitory.count({
      where: { schoolId, status: "ACTIVE" },
    }),
    prisma.sleepingPosition.count({
      where: { schoolId, isOccupied: false },
    }),
  ]);

  return {
    hasDormitories: dormCount > 0,
    freePositionsCount: freePositions,
    activeDormsCount: dormCount,
  };
}
