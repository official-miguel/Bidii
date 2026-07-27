-- AlterEnum: Add MAINTENANCE_HOLD to AllocationStatus
-- This status preserves a student's exact bed assignment when a dorm is
-- closed or put under maintenance, so it can be restored on reactivation.

ALTER TYPE "AllocationStatus" ADD VALUE 'MAINTENANCE_HOLD';

-- CreateIndex: fast lookup of held allocations per dorm
CREATE INDEX IF NOT EXISTS "AllocationRecord_dormId_status_idx"
  ON "AllocationRecord"("dormId", "status");
