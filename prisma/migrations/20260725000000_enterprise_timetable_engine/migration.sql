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
