-- Additive only: two new Module enum values so Discipline and Achievements
-- can be permissioned independently inside the Records module. Existing
-- RECORDS rows keep working (legacy umbrella permission).
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'RECORDS_DISCIPLINE';
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'RECORDS_ACHIEVEMENTS';
