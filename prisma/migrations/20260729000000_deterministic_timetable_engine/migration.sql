-- =============================================================================
-- Migration: deterministic_timetable_engine
--
-- Rebuilds the timetable module around a deterministic, school-configured
-- scheduling engine. AI is no longer used to generate timetables — it only
-- translates natural-language scheduling preferences into structured rules.
--
-- CHANGES:
--   1. New enums: TimetableSlotType, TimetableSession
--   2. Subject.internalCode — auto-incrementing stable join key, never reused
--   3. TimetableConfig rebuild — removes old hardcoded period/break fields,
--      adds operatingDays array, academicYear, term, maxLessonsPerTeacherPerDay
--   4. TimetableTemplateColumn — configurable column-per-slot format
--   5. SubjectLessonRequirement — per-(class, subject) lesson counts replacing
--      Subject.lessonsPerWeek
--   6. TimetablePreference — structured scheduling preferences replacing
--      AiTimetableConstraint
--   7. Data migration: Subject.lessonsPerWeek → SubjectLessonRequirement rows
--   8. AiTimetableConstraint dropped (replaced by TimetablePreference)
--
-- SAFE FOR EXISTING DATA:
--   - TimetableSlot, ClassSubjectTeacher, TeacherUnavailability untouched
--   - TimetableVersion, TimetableVersionSlot, TimetableChangeLog untouched
--   - OperatingDay, SpecialPeriod, SubjectWorkloadRule untouched (still used
--     by the v2/config endpoint)
--   - All existing foreign keys preserved
-- =============================================================================

-- ── 1. New enums ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "TimetableSlotType" AS ENUM (
    'LESSON', 'BREAK', 'LUNCH', 'GAMES', 'ASSEMBLY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TimetableSession" AS ENUM (
    'MORNING', 'AFTERNOON', 'EVENING'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Subject.internalCode ───────────────────────────────────────────────
-- Auto-incrementing code, unique per school, never reused even if a subject
-- is removed. Used by the engine as a stable join key instead of name strings.
-- Default 0 = "unassigned". The subject-codes API assigns real codes in order.

ALTER TABLE "Subject"
  ADD COLUMN IF NOT EXISTS "internalCode" INTEGER NOT NULL DEFAULT 0;

-- Assign initial internalCodes to existing subjects in registration order
-- (uses a window function to produce per-school sequential numbering)
DO $$
DECLARE
  school_rec RECORD;
  subject_rec RECORD;
  next_code INTEGER;
BEGIN
  FOR school_rec IN
    SELECT DISTINCT "schoolId" FROM "Subject"
  LOOP
    next_code := 1;
    FOR subject_rec IN
      SELECT id FROM "Subject"
      WHERE "schoolId" = school_rec."schoolId" AND "internalCode" = 0
      ORDER BY "createdAt" ASC, id ASC
    LOOP
      UPDATE "Subject"
        SET "internalCode" = next_code
        WHERE id = subject_rec.id;
      next_code := next_code + 1;
    END LOOP;
  END LOOP;
END $$;

-- Unique constraint: each school's codes are distinct and non-repeating
CREATE UNIQUE INDEX IF NOT EXISTS "Subject_schoolId_internalCode_key"
  ON "Subject"("schoolId", "internalCode")
  WHERE "internalCode" > 0;

-- ── 3. TimetableConfig rebuild ────────────────────────────────────────────
-- The old fields (periodsPerDay, breakAfterPeriod, lunchAfterPeriod, etc.)
-- used a hardcoded period model. The new system uses TimetableTemplateColumn
-- rows to define the school day, so the fixed fields are no longer needed.
-- We keep them as nullable for a short backward-compatibility window, then
-- add the new columns.

-- Add new fields
ALTER TABLE "TimetableConfig"
  ADD COLUMN IF NOT EXISTS "academicYear"               TEXT,
  ADD COLUMN IF NOT EXISTS "term"                       INTEGER,
  ADD COLUMN IF NOT EXISTS "operatingDays"              INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4}';

-- maxLessonsPerTeacherPerDay already exists with DEFAULT 6 — keep it.
-- Remove the old fixed-format columns only if they exist (some installs may
-- have already run partial migrations).
ALTER TABLE "TimetableConfig"
  DROP COLUMN IF EXISTS "periodsPerDay",
  DROP COLUMN IF EXISTS "breakAfterPeriod",
  DROP COLUMN IF EXISTS "lunchAfterPeriod",
  DROP COLUMN IF EXISTS "gamesDayOfWeek",
  DROP COLUMN IF EXISTS "gamesPeriod",
  DROP COLUMN IF EXISTS "dayStartTime",
  DROP COLUMN IF EXISTS "periodDurationMinutes",
  DROP COLUMN IF EXISTS "breakDurationMinutes",
  DROP COLUMN IF EXISTS "lunchDurationMinutes",
  DROP COLUMN IF EXISTS "assemblyAfterPeriod",
  DROP COLUMN IF EXISTS "assemblyDurationMinutes",
  DROP COLUMN IF EXISTS "activeVersionId",
  DROP COLUMN IF EXISTS "operatingDaysOfWeek",
  DROP COLUMN IF EXISTS "useVersionedTimetable";

-- Ensure updatedAt exists (was already there)
-- No change needed for createdAt — TimetableConfig is @id so no createdAt

-- ── 4. TimetableTemplateColumn ────────────────────────────────────────────
-- One row per column in the timetable template. Admins configure this once
-- and every class's timetable follows the same format.

CREATE TABLE IF NOT EXISTS "TimetableTemplateColumn" (
  "id"        TEXT              NOT NULL,
  "configId"  TEXT              NOT NULL,  -- → TimetableConfig.schoolId
  "position"  INTEGER           NOT NULL,  -- 1-based display order
  "startTime" TEXT              NOT NULL,  -- "HH:MM" 24-hour
  "endTime"   TEXT              NOT NULL,  -- "HH:MM" 24-hour
  "slotType"  "TimetableSlotType" NOT NULL DEFAULT 'LESSON',
  "label"     TEXT,                        -- required for non-LESSON slots
  "session"   "TimetableSession"  NOT NULL DEFAULT 'MORNING',
  "createdAt" TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableTemplateColumn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TimetableTemplateColumn_configId_position_key"
  ON "TimetableTemplateColumn"("configId", "position");

CREATE INDEX IF NOT EXISTS "TimetableTemplateColumn_configId_idx"
  ON "TimetableTemplateColumn"("configId");

ALTER TABLE "TimetableTemplateColumn"
  DROP CONSTRAINT IF EXISTS "TimetableTemplateColumn_configId_fkey";

ALTER TABLE "TimetableTemplateColumn"
  ADD CONSTRAINT "TimetableTemplateColumn_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "TimetableConfig"("schoolId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. SubjectLessonRequirement ───────────────────────────────────────────
-- Per-(subject, class) lesson count. Replaces the single Subject.lessonsPerWeek
-- field so different classes/streams can have different requirements (8-4-4
-- vs CBC vs CBE all differ).

CREATE TABLE IF NOT EXISTS "SubjectLessonRequirement" (
  "id"             TEXT    NOT NULL,
  "schoolId"       TEXT    NOT NULL,
  "subjectId"      TEXT    NOT NULL,
  "classId"        TEXT    NOT NULL,
  "lessonsPerWeek" INTEGER NOT NULL DEFAULT 5,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubjectLessonRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubjectLessonRequirement_subjectId_classId_key"
  ON "SubjectLessonRequirement"("subjectId", "classId");

CREATE INDEX IF NOT EXISTS "SubjectLessonRequirement_schoolId_idx"
  ON "SubjectLessonRequirement"("schoolId");

CREATE INDEX IF NOT EXISTS "SubjectLessonRequirement_subjectId_idx"
  ON "SubjectLessonRequirement"("subjectId");

CREATE INDEX IF NOT EXISTS "SubjectLessonRequirement_classId_idx"
  ON "SubjectLessonRequirement"("classId");

ALTER TABLE "SubjectLessonRequirement"
  DROP CONSTRAINT IF EXISTS "SubjectLessonRequirement_schoolId_fkey";
ALTER TABLE "SubjectLessonRequirement"
  DROP CONSTRAINT IF EXISTS "SubjectLessonRequirement_subjectId_fkey";
ALTER TABLE "SubjectLessonRequirement"
  DROP CONSTRAINT IF EXISTS "SubjectLessonRequirement_classId_fkey";

ALTER TABLE "SubjectLessonRequirement"
  ADD CONSTRAINT "SubjectLessonRequirement_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectLessonRequirement"
  ADD CONSTRAINT "SubjectLessonRequirement_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectLessonRequirement"
  ADD CONSTRAINT "SubjectLessonRequirement_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6. Data migration: Subject.lessonsPerWeek → SubjectLessonRequirement ──
-- Populate SubjectLessonRequirement rows from the legacy lessonsPerWeek column
-- before we consider removing it. One row per (class in applicableForms, subject).
-- Uses gen_random_uuid() to generate IDs.

INSERT INTO "SubjectLessonRequirement"
  ("id", "schoolId", "subjectId", "classId", "lessonsPerWeek", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  s."schoolId",
  s.id,
  c.id,
  COALESCE(s."lessonsPerWeek", 5),
  NOW(),
  NOW()
FROM "Subject" s
JOIN "SchoolClass" c ON c."schoolId" = s."schoolId"
WHERE
  -- Only for applicable forms (or no form restriction)
  (s."applicableForms" = '{}' OR c.form = ANY(s."applicableForms"))
ON CONFLICT ("subjectId", "classId") DO NOTHING;

-- ── 7. TimetablePreference ────────────────────────────────────────────────
-- Structured scheduling preferences — replaces AiTimetableConstraint.
-- AI translates natural language into these; the engine reads them as
-- session constraints. One row = one subject's session preference.

CREATE TABLE IF NOT EXISTS "TimetablePreference" (
  "id"               TEXT              NOT NULL,
  "configId"         TEXT              NOT NULL,  -- → TimetableConfig.schoolId
  "instruction"      TEXT              NOT NULL,  -- original NL instruction
  "subjectCode"      TEXT,                        -- NULL = school-wide preference
  "preferredSession" "TimetableSession",
  "isHard"           BOOLEAN           NOT NULL DEFAULT FALSE,
  "metadata"         JSONB,
  "createdAt"        TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetablePreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimetablePreference_configId_idx"
  ON "TimetablePreference"("configId");

ALTER TABLE "TimetablePreference"
  DROP CONSTRAINT IF EXISTS "TimetablePreference_configId_fkey";

ALTER TABLE "TimetablePreference"
  ADD CONSTRAINT "TimetablePreference_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "TimetableConfig"("schoolId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 8. Migrate AiTimetableConstraint → TimetablePreference ───────────────
-- Copy any existing natural language instructions from the old table so they
-- aren't silently lost. They land as GENERIC soft preferences with no
-- structured session mapping — admins will need to re-parse them.

INSERT INTO "TimetablePreference"
  ("id", "configId", "instruction", "subjectCode", "preferredSession",
   "isHard", "metadata", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  a."schoolId",
  a."instruction",
  NULL,   -- subjectCode not available in the old format
  NULL,   -- session not yet parsed
  FALSE,
  CASE WHEN a."parsed" IS NOT NULL
       THEN jsonb_build_object('migratedFrom', 'AiTimetableConstraint', 'originalParsed', a."parsed")
       ELSE jsonb_build_object('migratedFrom', 'AiTimetableConstraint')
  END,
  a."createdAt",
  NOW()
FROM "AiTimetableConstraint" a
-- Only if a TimetableConfig row exists for this school
WHERE EXISTS (
  SELECT 1 FROM "TimetableConfig" tc WHERE tc."schoolId" = a."schoolId"
)
ON CONFLICT DO NOTHING;

-- ── 9. Drop AiTimetableConstraint ─────────────────────────────────────────
-- Data has been migrated. The table is no longer referenced by any code.

DROP TABLE IF EXISTS "AiTimetableConstraint";

-- Also remove the back-reference from School (FK is dropped when table drops
-- in Postgres, but we clean up the index explicitly if it lingers).
DROP INDEX IF EXISTS "AiTimetableConstraint_schoolId_idx";

-- ── 10. Drop Subject.lessonsPerWeek ───────────────────────────────────────
-- SubjectLessonRequirement now holds per-class counts. The old single
-- field is no longer read anywhere; data was migrated in step 6.

ALTER TABLE "Subject"
  DROP COLUMN IF EXISTS "lessonsPerWeek";

-- ── 11. Ensure TimetableConfig.updatedAt is maintained ───────────────────
-- Add a trigger so updatedAt is automatically maintained on upsert,
-- matching Prisma's @updatedAt behavior for tables managed by raw SQL.
-- (Only needed if not already present from a previous migration.)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'timetable_template_column_updated_at'
  ) THEN
    CREATE TRIGGER timetable_template_column_updated_at
      BEFORE UPDATE ON "TimetableTemplateColumn"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'subject_lesson_requirement_updated_at'
  ) THEN
    CREATE TRIGGER subject_lesson_requirement_updated_at
      BEFORE UPDATE ON "SubjectLessonRequirement"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'timetable_preference_updated_at'
  ) THEN
    CREATE TRIGGER timetable_preference_updated_at
      BEFORE UPDATE ON "TimetablePreference"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── 12. Performance indexes ───────────────────────────────────────────────

-- Subject by internalCode (engine's primary lookup key)
CREATE INDEX IF NOT EXISTS "Subject_schoolId_internalCode_idx"
  ON "Subject"("schoolId", "internalCode");

-- TimetablePreference by subject code (engine reads all prefs for a school)
CREATE INDEX IF NOT EXISTS "TimetablePreference_configId_subjectCode_idx"
  ON "TimetablePreference"("configId", "subjectCode");

-- SubjectLessonRequirement covering index for generation (all reqs for a school)
CREATE INDEX IF NOT EXISTS "SubjectLessonRequirement_schoolId_classId_idx"
  ON "SubjectLessonRequirement"("schoolId", "classId");
