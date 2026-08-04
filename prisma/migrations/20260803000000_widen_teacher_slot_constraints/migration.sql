-- Migration: widen_teacher_slot_constraints
--
-- Problem
-- ───────
-- The old unique constraints on TimetableVersionSlot and TimetableSlot did not
-- include classId in the teacher-booking key.  When a teacher legitimately runs
-- a pooled/merged elective-group session for two different classes at the same
-- (dayOfWeek, period), the insert path used ON CONFLICT DO NOTHING and silently
-- dropped the second class's row — one class ended up with no lesson recorded.
--
-- Fix
-- ───
-- Add classId to both teacher-slot unique constraints.  The new keys are:
--
--   TimetableVersionSlot:  (versionId, classId, teacherId, dayOfWeek, period)
--   TimetableSlot:         (classId, teacherId, dayOfWeek, period)
--
-- This still prevents a teacher being double-booked for the *same* class at the
-- same time, while correctly allowing two rows for two *different* classes in the
-- same period (pooled teaching).
--
-- Data safety
-- ───────────
-- Widening a unique index (adding a column) makes it LESS restrictive — it can
-- never cause existing rows to violate the new constraint.  No backfill or data
-- cleanup is required before running this migration.

-- ── TimetableVersionSlot ────────────────────────────────────────────────────

-- Drop the old narrow constraint (teacherId, dayOfWeek, period without classId)
DROP INDEX IF EXISTS "TimetableVersionSlot_teacher_slot_key";

-- Create the new wider constraint that includes classId
CREATE UNIQUE INDEX "TimetableVersionSlot_teacher_class_slot_key"
  ON "TimetableVersionSlot" ("versionId", "classId", "teacherId", "dayOfWeek", "period");

-- ── TimetableSlot (live/published timetable) ────────────────────────────────

-- Drop the old narrow constraint (teacherId, dayOfWeek, period without classId)
DROP INDEX IF EXISTS "teacher_slot";

-- Create the new wider constraint that includes classId
CREATE UNIQUE INDEX "teacher_class_slot"
  ON "TimetableSlot" ("classId", "teacherId", "dayOfWeek", "period");
