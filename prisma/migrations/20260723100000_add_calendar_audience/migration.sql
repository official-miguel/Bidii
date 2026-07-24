-- Migration: add CalendarAudience enum and audience column to CalendarEvent
-- Audience controls who can see a calendar event: EVERYONE, STAFF_ONLY, or PARENTS_ONLY.
-- Default is EVERYONE so all existing events remain visible to all users.

CREATE TYPE "CalendarAudience" AS ENUM ('EVERYONE', 'STAFF_ONLY', 'PARENTS_ONLY');

ALTER TABLE "CalendarEvent"
  ADD COLUMN "audience" "CalendarAudience" NOT NULL DEFAULT 'EVERYONE';

CREATE INDEX "CalendarEvent_schoolId_audience_idx" ON "CalendarEvent"("schoolId", "audience");
