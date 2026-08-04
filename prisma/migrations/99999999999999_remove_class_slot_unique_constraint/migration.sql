-- Remove the unique constraint that prevents multiple subjects per class slot
-- This is needed for elective groups to work properly

DROP INDEX IF EXISTS "TimetableVersionSlot_class_slot_key";

-- Add a regular index for query performance
CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_class_slot_idx" 
  ON "TimetableVersionSlot"("versionId", "classId", "dayOfWeek", "period");