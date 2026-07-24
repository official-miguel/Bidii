-- Migration: 20260720000000_add_ranking_config_and_report_remark
--
-- What this migration does:
--
--  PART A — RankingConfig
--    1. Create RankingConfig table (one row per school, stores composite
--       score weights for teacher ranking). CHECK constraint enforces
--       that the three weights sum to 1.0 (within float tolerance).
--
--  PART B — ReportRemark
--    2. Create ReportRemark table (one row per school+period+student,
--       stores the AI-drafted remark and any teacher-edited override).
--
-- All DDL is wrapped in a single transaction.

BEGIN;

-- ===========================================================================
-- PART A — RankingConfig
-- ===========================================================================

-- 1. RankingConfig — one row per school, stores ranking weight configuration.
--    schoolId is the PK (mirrors TimetableConfig pattern). Cascade-deletes
--    with the school.
CREATE TABLE IF NOT EXISTS "RankingConfig" (
  "schoolId"          TEXT             NOT NULL,
  "improvementWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "completionWeight"  DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "absoluteWeight"    DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "updatedAt"         TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "RankingConfig_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "RankingConfig_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,

  -- Enforce that the three weights sum to 1.0 within float tolerance.
  CONSTRAINT "chk_ranking_config_weights_sum"
    CHECK (
      ABS("improvementWeight" + "completionWeight" + "absoluteWeight" - 1.0) < 0.001
    )
);

-- ===========================================================================
-- PART B — ReportRemark
-- ===========================================================================

-- 2. ReportRemark — one row per (school, period, student).
--    Stores the AI-drafted remark and any teacher-edited override.
--    editedRemark takes precedence over draftRemark in the UI/PDF when set.
CREATE TABLE IF NOT EXISTS "ReportRemark" (
  "id"            TEXT         NOT NULL,
  "schoolId"      TEXT         NOT NULL,
  "periodId"      TEXT         NOT NULL,
  "studentId"     TEXT         NOT NULL,
  "draftRemark"   TEXT,
  "editedRemark"  TEXT,
  "isAiGenerated" BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportRemark_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportRemark_schoolId_periodId_studentId_key"
    UNIQUE ("schoolId", "periodId", "studentId"),

  CONSTRAINT "ReportRemark_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "ReportRemark_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "AssessmentPeriod"("id") ON DELETE CASCADE,
  CONSTRAINT "ReportRemark_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReportRemark_schoolId_periodId_idx"
  ON "ReportRemark"("schoolId", "periodId");

COMMIT;
