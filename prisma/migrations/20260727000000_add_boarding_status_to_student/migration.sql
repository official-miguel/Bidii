-- Migration: add boardingStatus column to Student table
-- DAY | BOARDING — persisted so the UI can display, filter, and trigger
-- dorm auto-allocation correctly on every registration and edit.
-- NULL means "not specified" (legacy rows before this migration).

ALTER TABLE "Student" ADD COLUMN "boardingStatus" TEXT;
