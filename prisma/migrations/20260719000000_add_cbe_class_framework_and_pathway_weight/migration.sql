-- Migration: 20260719000000_add_cbe_class_framework_and_pathway_weight
--
-- Part A: Add frameworkType column to SchoolClass (default EIGHT_FOUR_FOUR).
--         All existing classes stay 8-4-4 — zero data disruption.
--
-- Part B: Create PathwayWeight table for Senior CBE SBA/exam weighting.
--         Includes a CHECK constraint enforcing sbaWeight + examWeight = 1.0.
--
-- All DDL is idempotent (IF NOT EXISTS / IF NOT EXISTS guards).

BEGIN;

-- ===========================================================================
-- PART A — Add frameworkType to SchoolClass
-- ===========================================================================

ALTER TABLE "SchoolClass"
  ADD COLUMN IF NOT EXISTS "frameworkType" "FrameworkType" NOT NULL DEFAULT 'EIGHT_FOUR_FOUR';

-- ===========================================================================
-- PART B — PathwayWeight table
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "PathwayWeight" (
  "id"           TEXT             NOT NULL,
  "schoolId"     TEXT             NOT NULL,
  "frameworkId"  TEXT             NOT NULL,
  "subjectId"    TEXT             NOT NULL,
  "sbaWeight"    DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  "examWeight"   DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "sbaMaxMarks"  DOUBLE PRECISION NOT NULL DEFAULT 100,
  "examMaxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "PathwayWeight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PathwayWeight_frameworkId_subjectId_key"
    UNIQUE ("frameworkId", "subjectId"),

  CONSTRAINT "PathwayWeight_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "PathwayWeight_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE,
  CONSTRAINT "PathwayWeight_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE,

  -- Ensure the two weights sum to exactly 1.0.
  CONSTRAINT "chk_pathway_weight_sum"
    CHECK ("sbaWeight" + "examWeight" = 1.0)
);

CREATE INDEX IF NOT EXISTS "PathwayWeight_schoolId_idx"
  ON "PathwayWeight"("schoolId");

COMMIT;
