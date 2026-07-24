-- Attendance becomes two-state (checkbox UI): checked = PRESENT, unchecked = ABSENT.
-- Existing LATE rows count as present (the student was in school); EXCUSED as absent.
UPDATE "Attendance" SET "status" = 'PRESENT' WHERE "status" = 'LATE';
UPDATE "Attendance" SET "status" = 'ABSENT'  WHERE "status" = 'EXCUSED';

-- Postgres can't drop enum values in place: swap in a new two-value enum.
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');
ALTER TABLE "Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attendance"
  ALTER COLUMN "status" TYPE "AttendanceStatus"
  USING ("status"::text::"AttendanceStatus");
ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
DROP TYPE "AttendanceStatus_old";
