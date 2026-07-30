-- =============================================================================
-- Migration: fix_timetable_schema_sync
--
-- Syncs the Prisma schema with the actual database state.
--
-- PROBLEMS FIXED:
--   1. TimetableConfig.createdAt was in the schema but not in the DB,
--      causing every query to TimetableConfig to fail with a 500 error.
--      Affects: /api/timetable/template, /api/timetable/v2/generate,
--               /api/timetable/v2/pre-check
--
--   2. TimetableVersion, TimetableVersionSlot, TimetableChangeLog and their
--      enums (TimetableVersionStatus, TimetableChangeAction) exist in the DB
--      but were missing from the Prisma schema. Adding them here so Prisma's
--      migration history stays consistent with the live DB.
-- =============================================================================

-- ── 1. Add createdAt to TimetableConfig ───────────────────────────────────
-- The Prisma schema declares createdAt but the DB table was built without it.
-- Back-fill with updatedAt so existing rows get a sane timestamp.

ALTER TABLE "TimetableConfig"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Back-fill existing rows: use updatedAt as an approximation
UPDATE "TimetableConfig"
  SET "createdAt" = "updatedAt"
  WHERE "createdAt" = CURRENT_TIMESTAMP
    AND "updatedAt" < CURRENT_TIMESTAMP;

-- ── 2. TimetableVersionStatus enum ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. TimetableChangeAction enum ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TimetableChangeAction" AS ENUM (
    'GENERATED', 'PUBLISHED', 'ARCHIVED', 'SLOT_EDITED', 'SLOT_LOCKED',
    'SLOT_UNLOCKED', 'CLONED', 'DELETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. TimetableVersion ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TimetableVersion" (
  "id"            TEXT                      NOT NULL,
  "schoolId"      TEXT                      NOT NULL,
  "name"          TEXT                      NOT NULL,
  "description"   TEXT,
  "status"        "TimetableVersionStatus"  NOT NULL DEFAULT 'DRAFT',
  "academicYear"  TEXT,
  "term"          INTEGER,
  "clonedFromId"  TEXT,
  "generatedAt"   TIMESTAMP(3),
  "publishedAt"   TIMESTAMP(3),
  "publishedById" TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimetableVersion_schoolId_idx"
  ON "TimetableVersion"("schoolId");

CREATE INDEX IF NOT EXISTS "TimetableVersion_schoolId_status_idx"
  ON "TimetableVersion"("schoolId", "status");

-- Only one published timetable per school
CREATE UNIQUE INDEX IF NOT EXISTS "TimetableVersion_schoolId_published_unique"
  ON "TimetableVersion"("schoolId")
  WHERE (status = 'PUBLISHED'::"TimetableVersionStatus");

-- ── 5. TimetableVersionSlot ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TimetableVersionSlot" (
  "id"           TEXT         NOT NULL,
  "versionId"    TEXT         NOT NULL,
  "schoolId"     TEXT         NOT NULL,
  "classId"      TEXT         NOT NULL,
  "dayOfWeek"    INTEGER      NOT NULL,
  "period"       INTEGER      NOT NULL,
  "subjectId"    TEXT         NOT NULL,
  "teacherId"    TEXT         NOT NULL,
  "room"         TEXT,
  "isManual"     BOOLEAN      NOT NULL DEFAULT FALSE,
  "notes"        TEXT,
  "isLocked"     BOOLEAN      NOT NULL DEFAULT FALSE,
  "lockScope"    TEXT,
  "lockedAt"     TIMESTAMP(3),
  "lockedById"   TEXT,
  "lockReason"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableVersionSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TimetableVersionSlot_class_slot_key"
  ON "TimetableVersionSlot"("versionId", "classId", "dayOfWeek", "period");

CREATE UNIQUE INDEX IF NOT EXISTS "TimetableVersionSlot_teacher_slot_key"
  ON "TimetableVersionSlot"("versionId", "teacherId", "dayOfWeek", "period");

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_versionId_idx"
  ON "TimetableVersionSlot"("versionId");

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_schoolId_idx"
  ON "TimetableVersionSlot"("schoolId");

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_classId_idx"
  ON "TimetableVersionSlot"("classId");

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_teacherId_idx"
  ON "TimetableVersionSlot"("teacherId");

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_isLocked_idx"
  ON "TimetableVersionSlot"("versionId", "isLocked");

-- ── 6. TimetableChangeLog ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TimetableChangeLog" (
  "id"            TEXT                    NOT NULL,
  "schoolId"      TEXT                    NOT NULL,
  "versionId"     TEXT,
  "action"        "TimetableChangeAction" NOT NULL,
  "detail"        JSONB                   NOT NULL DEFAULT '{}',
  "performedById" TEXT,
  "performedAt"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changeSource"  TEXT,
  "slotId"        TEXT,
  "beforeState"   JSONB,
  "afterState"    JSONB,
  "reason"        TEXT,
  CONSTRAINT "TimetableChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimetableChangeLog_schoolId_idx"
  ON "TimetableChangeLog"("schoolId");

CREATE INDEX IF NOT EXISTS "TimetableChangeLog_versionId_idx"
  ON "TimetableChangeLog"("versionId");
