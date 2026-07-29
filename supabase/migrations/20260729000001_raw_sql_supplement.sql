-- ═══════════════════════════════════════════════════════════════════════════
-- Raw-SQL supplement — everything the Prisma datamodel diff cannot express.
-- GENERATED from prisma/migrations/ (see supabase/migrations/README.md).
-- Do not hand-edit; regenerate when the source migrations change.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Extensions (source: 20260723000000_scale_indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Timetable v2 engine — tables managed by raw SQL only (not in schema.prisma;
--    queried via $queryRaw by /api/timetable/v2/*). Included wholesale.
-- Source: prisma/migrations/20260725000000_enterprise_timetable_engine
-- Migration: enterprise_timetable_engine
-- Adds version management, operating-day config, special-period config,
-- subject workload rules, and timetable templates for the redesigned
-- enterprise timetable module. The existing TimetableSlot, TimetableConfig,
-- ClassSubjectTeacher, TeacherUnavailability, and AiTimetableConstraint
-- tables are retained unchanged so all existing data and API routes continue
-- to work without modification.

-- ── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SpecialPeriodType"       AS ENUM ('ASSEMBLY', 'BREAK', 'LUNCH', 'GAMES', 'CLUBS', 'REMEDIAL', 'CHAPEL', 'LIBRARY', 'CUSTOM');
CREATE TYPE "TimetableChangeAction"   AS ENUM ('CREATED', 'SLOT_ADDED', 'SLOT_REMOVED', 'SLOT_MOVED', 'PUBLISHED', 'ARCHIVED', 'CLONED', 'ROLLED_BACK', 'GENERATED');

-- ── TimetableVersion ──────────────────────────────────────────────────────
-- A named, versioned timetable for a school. Only one version may be
-- PUBLISHED at a time (enforced by partial unique index). DRAFT versions are
-- works-in-progress; ARCHIVED versions are read-only history.

CREATE TABLE "TimetableVersion" (
  "id"           TEXT         NOT NULL,
  "schoolId"     TEXT         NOT NULL,
  "name"         TEXT         NOT NULL,
  "description"  TEXT,
  "status"       "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "academicYear" TEXT,
  "term"         INTEGER,
  "clonedFromId" TEXT,
  "generatedAt"  TIMESTAMP(3),
  "publishedAt"  TIMESTAMP(3),
  "publishedById" TEXT,
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimetableVersion_schoolId_idx"
  ON "TimetableVersion"("schoolId");
CREATE INDEX "TimetableVersion_schoolId_status_idx"
  ON "TimetableVersion"("schoolId", "status");
-- Only one PUBLISHED version per school at a time
CREATE UNIQUE INDEX "TimetableVersion_schoolId_published_unique"
  ON "TimetableVersion"("schoolId")
  WHERE "status" = 'PUBLISHED';

ALTER TABLE "TimetableVersion"
  ADD CONSTRAINT "TimetableVersion_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TimetableVersionSlot ──────────────────────────────────────────────────
-- The individual slot rows belonging to a TimetableVersion. Mirrors the
-- shape of TimetableSlot exactly so the same rendering logic applies to
-- both PUBLISHED and DRAFT timetables.

CREATE TABLE "TimetableVersionSlot" (
  "id"         TEXT    NOT NULL,
  "versionId"  TEXT    NOT NULL,
  "schoolId"   TEXT    NOT NULL,
  "classId"    TEXT    NOT NULL,
  "dayOfWeek"  INTEGER NOT NULL,
  "period"     INTEGER NOT NULL,
  "subjectId"  TEXT    NOT NULL,
  "teacherId"  TEXT    NOT NULL,
  "room"       TEXT,
  "isManual"   BOOLEAN NOT NULL DEFAULT FALSE,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimetableVersionSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimetableVersionSlot_class_slot_key"
  ON "TimetableVersionSlot"("versionId", "classId", "dayOfWeek", "period");
CREATE UNIQUE INDEX "TimetableVersionSlot_teacher_slot_key"
  ON "TimetableVersionSlot"("versionId", "teacherId", "dayOfWeek", "period");
CREATE INDEX "TimetableVersionSlot_versionId_idx"
  ON "TimetableVersionSlot"("versionId");
CREATE INDEX "TimetableVersionSlot_schoolId_idx"
  ON "TimetableVersionSlot"("schoolId");
CREATE INDEX "TimetableVersionSlot_classId_idx"
  ON "TimetableVersionSlot"("classId");
CREATE INDEX "TimetableVersionSlot_teacherId_idx"
  ON "TimetableVersionSlot"("teacherId");

ALTER TABLE "TimetableVersionSlot"
  ADD CONSTRAINT "TimetableVersionSlot_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableVersionSlot"
  ADD CONSTRAINT "TimetableVersionSlot_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableVersionSlot"
  ADD CONSTRAINT "TimetableVersionSlot_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableVersionSlot"
  ADD CONSTRAINT "TimetableVersionSlot_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableVersionSlot"
  ADD CONSTRAINT "TimetableVersionSlot_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OperatingDay ──────────────────────────────────────────────────────────
-- Which days of the week the school operates, and whether each is a
-- half-day. Absence of a row means that day is inactive.

CREATE TABLE "OperatingDay" (
  "id"           TEXT    NOT NULL,
  "schoolId"     TEXT    NOT NULL,
  "dayOfWeek"    INTEGER NOT NULL,   -- 0=Mon … 6=Sun
  "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
  "isHalfDay"    BOOLEAN NOT NULL DEFAULT FALSE,
  "halfDayEndsAfterPeriod" INTEGER,
  "label"        TEXT,               -- optional override e.g. "Saturday Half"
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatingDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatingDay_schoolId_dayOfWeek_key"
  ON "OperatingDay"("schoolId", "dayOfWeek");
CREATE INDEX "OperatingDay_schoolId_idx"
  ON "OperatingDay"("schoolId");

ALTER TABLE "OperatingDay"
  ADD CONSTRAINT "OperatingDay_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SpecialPeriod ─────────────────────────────────────────────────────────
-- Fixed slots that cannot be used for regular lessons. Can be school-wide or
-- targeted at specific days/forms/streams.

CREATE TABLE "SpecialPeriod" (
  "id"          TEXT             NOT NULL,
  "schoolId"    TEXT             NOT NULL,
  "type"        "SpecialPeriodType" NOT NULL DEFAULT 'BREAK',
  "label"       TEXT             NOT NULL,
  "dayOfWeek"   INTEGER,           -- NULL = applies every active day
  "period"      INTEGER          NOT NULL,
  "durationMinutes" INTEGER,       -- overrides TimetableConfig if set
  "appliesToForms"  INTEGER[],     -- NULL/empty = all forms
  "appliesToClasses" TEXT[],       -- NULL/empty = all classes
  "isActive"    BOOLEAN          NOT NULL DEFAULT TRUE,
  "sortOrder"   INTEGER          NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "SpecialPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpecialPeriod_schoolId_idx" ON "SpecialPeriod"("schoolId");
CREATE INDEX "SpecialPeriod_schoolId_period_idx"
  ON "SpecialPeriod"("schoolId", "period");

ALTER TABLE "SpecialPeriod"
  ADD CONSTRAINT "SpecialPeriod_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SubjectWorkloadRule ───────────────────────────────────────────────────
-- Per-(school, subject, form) lesson requirements — overrides Subject.lessonsPerWeek
-- for specific forms so different year groups can have different load.

CREATE TABLE "SubjectWorkloadRule" (
  "id"               TEXT    NOT NULL,
  "schoolId"         TEXT    NOT NULL,
  "subjectId"        TEXT    NOT NULL,
  "form"             INTEGER NOT NULL,
  "lessonsPerWeek"   INTEGER NOT NULL DEFAULT 5,
  "doubleLesson"     BOOLEAN NOT NULL DEFAULT FALSE,
  "consecutiveDouble" BOOLEAN NOT NULL DEFAULT FALSE,
  "requiresSpecialRoom" TEXT,
  "maxPerDay"        INTEGER,   -- NULL = no per-day cap beyond global
  "minSpreadDays"    INTEGER,   -- minimum distinct days lessons should span
  "preferMorning"    BOOLEAN    NOT NULL DEFAULT FALSE,
  "preferAfternoon"  BOOLEAN    NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubjectWorkloadRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectWorkloadRule_schoolId_subjectId_form_key"
  ON "SubjectWorkloadRule"("schoolId", "subjectId", "form");
CREATE INDEX "SubjectWorkloadRule_schoolId_idx"
  ON "SubjectWorkloadRule"("schoolId");
CREATE INDEX "SubjectWorkloadRule_subjectId_idx"
  ON "SubjectWorkloadRule"("subjectId");

ALTER TABLE "SubjectWorkloadRule"
  ADD CONSTRAINT "SubjectWorkloadRule_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectWorkloadRule"
  ADD CONSTRAINT "SubjectWorkloadRule_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TimetableTemplate ─────────────────────────────────────────────────────
-- Reusable scheduling templates that can be cloned into new versions.
-- A template is a frozen TimetableVersion snapshot with a named purpose.

CREATE TABLE "TimetableTemplate" (
  "id"          TEXT    NOT NULL,
  "schoolId"    TEXT    NOT NULL,
  "name"        TEXT    NOT NULL,
  "description" TEXT,
  "sourceVersionId" TEXT,  -- the version this was saved from
  "slotCount"   INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimetableTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimetableTemplate_schoolId_name_key"
  ON "TimetableTemplate"("schoolId", "name");
CREATE INDEX "TimetableTemplate_schoolId_idx"
  ON "TimetableTemplate"("schoolId");

ALTER TABLE "TimetableTemplate"
  ADD CONSTRAINT "TimetableTemplate_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TimetableChangeLog ────────────────────────────────────────────────────
-- Immutable audit trail for every meaningful timetable action.

CREATE TABLE "TimetableChangeLog" (
  "id"          TEXT    NOT NULL,
  "schoolId"    TEXT    NOT NULL,
  "versionId"   TEXT,
  "action"      "TimetableChangeAction" NOT NULL,
  "detail"      JSONB   NOT NULL DEFAULT '{}',
  "performedById" TEXT,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimetableChangeLog_schoolId_idx"
  ON "TimetableChangeLog"("schoolId");
CREATE INDEX "TimetableChangeLog_versionId_idx"
  ON "TimetableChangeLog"("versionId");
CREATE INDEX "TimetableChangeLog_schoolId_performedAt_idx"
  ON "TimetableChangeLog"("schoolId", "performedAt" DESC);

ALTER TABLE "TimetableChangeLog"
  ADD CONSTRAINT "TimetableChangeLog_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Extend TimetableConfig ────────────────────────────────────────────────
-- Add fields for active version tracking and extended school-day config.

ALTER TABLE "TimetableConfig"
  ADD COLUMN IF NOT EXISTS "activeVersionId"        TEXT,
  ADD COLUMN IF NOT EXISTS "operatingDaysOfWeek"    INTEGER[] DEFAULT '{0,1,2,3,4}',
  ADD COLUMN IF NOT EXISTS "assemblyAfterPeriod"    INTEGER,
  ADD COLUMN IF NOT EXISTS "assemblyDurationMinutes" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "useVersionedTimetable"  BOOLEAN DEFAULT TRUE;

-- Source: prisma/migrations/20260726000000_timetable_overrides
-- Migration: timetable_overrides
-- Extends the timetable module with:
--   1. Slot-level locking  — isLocked, lockScope, lockedAt, lockedById, lockReason on TimetableVersionSlot
--   2. Rich audit trail    — changeSource, slotId, beforeState, afterState, reason on TimetableChangeLog
--   3. New enum values     — LOCK / UNLOCK added to TimetableChangeAction
--
-- All changes are purely additive (ALTER TABLE ADD COLUMN IF NOT EXISTS) so
-- existing rows and API routes continue to work unchanged.

-- ── 1. Extend TimetableVersionSlot ────────────────────────────────────────
-- isLocked:    Administrator has explicitly locked this slot — the re-optimize
--              engine must never move, replace, or delete it.
-- lockScope:   What was locked: SLOT (single cell), SUBJECT (all lessons of
--              this subject for this class), CLASS (entire class schedule),
--              DAY (all class lessons on that day), TEACHER (all lessons for
--              the teacher).
-- lockedAt:    When the lock was set.
-- lockedById:  Who set the lock (User.id — for display in audit trail).
-- lockReason:  Optional free-text explanation for why this slot is locked.
-- isManual:    Already exists (DEFAULT FALSE); set to TRUE for every manually
--              placed or moved slot so the engine can distinguish AI-generated
--              from human-edited entries.

ALTER TABLE "TimetableVersionSlot"
  ADD COLUMN IF NOT EXISTS "isLocked"    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "lockScope"   TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "lockReason"  TEXT;

CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_isLocked_idx"
  ON "TimetableVersionSlot"("versionId", "isLocked");

-- ── 2. Extend TimetableChangeLog ──────────────────────────────────────────
-- changeSource: "MANUAL" | "AI" | "SYSTEM" — who originated this change.
-- slotId:       The specific TimetableVersionSlot row affected (nullable —
--               version-level actions like PUBLISHED don't target a slot).
-- beforeState:  JSONB snapshot of the slot before the change (null for CREATED).
-- afterState:   JSONB snapshot of the slot after the change (null for DELETED).
-- reason:       Optional administrator-supplied reason for the change (e.g.
--               "Emergency: teacher sick on Monday").

ALTER TABLE "TimetableChangeLog"
  ADD COLUMN IF NOT EXISTS "changeSource" TEXT,
  ADD COLUMN IF NOT EXISTS "slotId"       TEXT,
  ADD COLUMN IF NOT EXISTS "beforeState"  JSONB,
  ADD COLUMN IF NOT EXISTS "afterState"   JSONB,
  ADD COLUMN IF NOT EXISTS "reason"       TEXT;

CREATE INDEX IF NOT EXISTS "TimetableChangeLog_slotId_idx"
  ON "TimetableChangeLog"("slotId");

CREATE INDEX IF NOT EXISTS "TimetableChangeLog_changeSource_idx"
  ON "TimetableChangeLog"("schoolId", "changeSource");

-- ── 3. New enum values for TimetableChangeAction ─────────────────────────
-- PostgreSQL does not support removing enum values but safely allows adding
-- new ones with ALTER TYPE … ADD VALUE … IF NOT EXISTS.

ALTER TYPE "TimetableChangeAction" ADD VALUE IF NOT EXISTS 'LOCK';
ALTER TYPE "TimetableChangeAction" ADD VALUE IF NOT EXISTS 'UNLOCK';
ALTER TYPE "TimetableChangeAction" ADD VALUE IF NOT EXISTS 'REOPTIMIZED';
ALTER TYPE "TimetableChangeAction" ADD VALUE IF NOT EXISTS 'OVERRIDE_APPLIED';

-- 3. Custom indexes on modeled tables (partial, GIN/trigram, and composite
--    indexes created in perf/scale/library migrations, absent from the datamodel).


CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_enteredById_periodId_idx"
  ON "AssessmentItem"("schoolId", "enteredById", "periodId");


-- Speeds up GET /api/sync/pull?domain=assessmentItems (school + period + recency)
CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_periodId_updatedAt_idx"
  ON "AssessmentItem"("schoolId", "periodId", "updatedAt");


CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_subjectId_periodId_idx"
  ON "AssessmentItem"("schoolId", "subjectId", "periodId");
-- Performance indexes for offline sync delta-pull queries.
-- All use IF NOT EXISTS — safe to apply on databases with existing data.
-- The schema already defines @@index([classId, date]) on Attendance via
-- Prisma, so that index already exists in the DB. The three below are new.

-- Speeds up GET /api/sync/pull?domain=attendance (filter by schoolId + updatedAt)
CREATE INDEX IF NOT EXISTS "Attendance_schoolId_updatedAt_idx"
  ON "Attendance"("schoolId", "updatedAt");


-- ---------------------------------------------------------------------------
-- Performance indexes on LibraryBorrow for common dashboard queries
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "LibraryBorrow_active_idx"
  ON "LibraryBorrow"("schoolId") WHERE "returnedAt" IS NULL;


CREATE INDEX IF NOT EXISTS "LibraryBorrow_copyId_idx" ON "LibraryBorrow"("copyId");


CREATE INDEX IF NOT EXISTS "LibraryBorrow_overdue_idx"
  ON "LibraryBorrow"("schoolId", "dueAt") WHERE "returnedAt" IS NULL AND "fineStoppedAt" IS NULL;


CREATE INDEX IF NOT EXISTS "LibraryCard_status_idx" ON "LibraryCard"("schoolId", "status");

CREATE INDEX "LibraryCatalogue_category_idx"        ON "LibraryCatalogue"("schoolId", "category");

CREATE INDEX "LibraryCatalogue_form_idx"            ON "LibraryCatalogue"("schoolId", "form");


CREATE UNIQUE INDEX "LibraryCatalogue_school_bookNumber" ON "LibraryCatalogue"("schoolId", "bookNumber")
  WHERE "bookNumber" IS NOT NULL;

CREATE INDEX "LibraryCatalogue_shelf_idx"           ON "LibraryCatalogue"("schoolId", "shelf");

CREATE INDEX "LibraryCatalogue_subject_idx"        ON "LibraryCatalogue"("schoolId", "subject");

CREATE INDEX "LibraryCatalogue_title_idx"           ON "LibraryCatalogue"("schoolId", "title");

CREATE INDEX "LibraryCirculationEvent_createdAt_idx"      ON "LibraryCirculationEvent"("schoolId", "createdAt" DESC);

CREATE INDEX "LibraryCirculationEvent_eventType_idx"      ON "LibraryCirculationEvent"("schoolId", "eventType");


CREATE UNIQUE INDEX "LibraryCopy_school_accessionNumber" ON "LibraryCopy"("schoolId", "accessionNumber");

CREATE INDEX "LibraryCopy_status_idx"         ON "LibraryCopy"("schoolId", "status");

CREATE INDEX "LibraryFinePause_schoolId_active_idx" ON "LibraryFinePause"("schoolId", "isActive");


CREATE UNIQUE INDEX "LibraryPolicy_schoolId_patronType" ON "LibraryPolicy"("schoolId", "patronType");


CREATE INDEX "SleepingPosition_bedId_idx" ON "SleepingPosition"("bedId");


CREATE INDEX IF NOT EXISTS "Student_fullName_trgm_idx"
  ON "Student" USING GIN ("fullName" gin_trgm_ops);


CREATE INDEX IF NOT EXISTS "Student_schoolId_classId_idx"
  ON "Student"("schoolId", "classId");


-- Speeds up GET /api/sync/pull?domain=students (filter by schoolId + updatedAt)
CREATE INDEX IF NOT EXISTS "Student_schoolId_updatedAt_idx"
  ON "Student"("schoolId", "updatedAt");
