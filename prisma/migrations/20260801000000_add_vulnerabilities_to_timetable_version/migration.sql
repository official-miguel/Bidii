-- Migration: add_vulnerabilities_to_timetable_version
--
-- The Prisma schema declares a `vulnerabilities Json?` column on
-- TimetableVersion, but this column was never added to the live database.
-- The /api/timetable/v2/generate route performs a raw INSERT that includes
-- this column, causing a 500 "column does not exist" error every time a
-- timetable is generated.
--
-- This migration adds the column so generation succeeds.

ALTER TABLE "TimetableVersion"
  ADD COLUMN IF NOT EXISTS "vulnerabilities" JSONB;
