-- ============================================================================
-- Migration: Library Stage 2 — Policies, Reservations, Fine Audit,
--            Circulation Events, Classroom Loans, Fine Pauses
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

CREATE TYPE "LibraryPatronType" AS ENUM (
  'DEFAULT','STUDENT','TEACHER','BOARDING','DAY_SCHOLAR','JUNIOR','SENIOR'
);

CREATE TYPE "LibraryReservationType" AS ENUM (
  'INDIVIDUAL','CLASSROOM','DEPARTMENT','WAITLIST'
);

CREATE TYPE "LibraryReservationStatus" AS ENUM (
  'PENDING','ACTIVE','FULFILLED','CANCELLED','EXPIRED'
);

-- ---------------------------------------------------------------------------
-- LibraryPolicy — per-patron-type circulation rules
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryPolicy" (
  "id"                  TEXT        NOT NULL,
  "schoolId"            TEXT        NOT NULL,
  "patronType"          "LibraryPatronType" NOT NULL DEFAULT 'DEFAULT',
  "label"               TEXT,
  "maxBooksAllowed"     INTEGER     NOT NULL DEFAULT 3,
  "borrowDays"          INTEGER     NOT NULL DEFAULT 14,
  "gracePeriodDays"     INTEGER     NOT NULL DEFAULT 0,
  "finePerDay"          DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "countWeekends"       BOOLEAN     NOT NULL DEFAULT TRUE,
  "countHolidays"       BOOLEAN     NOT NULL DEFAULT FALSE,
  "maxRenewals"         INTEGER     NOT NULL DEFAULT 1,
  "fineBlockThreshold"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lostBookMultiplier"  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "lostBookFixedFee"    DOUBLE PRECISION NOT NULL DEFAULT 500,
  "damagedBookFineRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "reservationsAllowed" BOOLEAN     NOT NULL DEFAULT TRUE,
  "isActive"            BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryPolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryPolicy"
  ADD CONSTRAINT "LibraryPolicy_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "LibraryPolicy_schoolId_patronType" ON "LibraryPolicy"("schoolId", "patronType");
CREATE INDEX "LibraryPolicy_schoolId_idx" ON "LibraryPolicy"("schoolId");

-- Seed DEFAULT policy for every existing school
INSERT INTO "LibraryPolicy" ("id", "schoolId", "patronType", "label", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'DEFAULT', 'Default Policy', NOW()
FROM "School"
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- LibraryFineAudit — immutable fine event log
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryFineAudit" (
  "id"            TEXT        NOT NULL,
  "schoolId"      TEXT        NOT NULL,
  "cardId"        TEXT        NOT NULL,
  "borrowId"      TEXT,
  "eventType"     TEXT        NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balanceAfter"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reason"        TEXT,
  "performedById" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryFineAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryFineAudit"
  ADD CONSTRAINT "LibraryFineAudit_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

CREATE INDEX "LibraryFineAudit_schoolId_idx" ON "LibraryFineAudit"("schoolId");
CREATE INDEX "LibraryFineAudit_cardId_idx"   ON "LibraryFineAudit"("cardId");
CREATE INDEX "LibraryFineAudit_borrowId_idx" ON "LibraryFineAudit"("borrowId");

-- ---------------------------------------------------------------------------
-- LibraryFinePause — scheduled fine accumulation pauses
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryFinePause" (
  "id"          TEXT        NOT NULL,
  "schoolId"    TEXT        NOT NULL,
  "scope"       TEXT        NOT NULL DEFAULT 'SCHOOL_WIDE',
  "studentId"   TEXT,
  "label"       TEXT        NOT NULL,
  "reason"      TEXT,
  "startDate"   TIMESTAMP(3) NOT NULL,
  "endDate"     TIMESTAMP(3),
  "isActive"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryFinePause_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryFinePause"
  ADD CONSTRAINT "LibraryFinePause_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

CREATE INDEX "LibraryFinePause_schoolId_idx"        ON "LibraryFinePause"("schoolId");
CREATE INDEX "LibraryFinePause_schoolId_active_idx" ON "LibraryFinePause"("schoolId", "isActive");

-- ---------------------------------------------------------------------------
-- LibraryReservation — individual / classroom / department / waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryReservation" (
  "id"                 TEXT        NOT NULL,
  "schoolId"           TEXT        NOT NULL,
  "catalogueId"        TEXT        NOT NULL,
  "reservationType"    "LibraryReservationType" NOT NULL DEFAULT 'INDIVIDUAL',
  "studentId"          TEXT,
  "teacherId"          TEXT,
  "departmentName"     TEXT,
  "expectedReturnDate" TIMESTAMP(3),
  "quantityRequested"  INTEGER     NOT NULL DEFAULT 1,
  "notes"              TEXT,
  "status"             "LibraryReservationStatus" NOT NULL DEFAULT 'PENDING',
  "allocatedCopyId"    TEXT,
  "fulfilledAt"        TIMESTAMP(3),
  "expiresAt"          TIMESTAMP(3),
  "queuePosition"      INTEGER,
  "createdById"        TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryReservation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryReservation"
  ADD CONSTRAINT "LibraryReservation_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

ALTER TABLE "LibraryReservation"
  ADD CONSTRAINT "LibraryReservation_catalogueId_fkey"
  FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE;

CREATE INDEX "LibraryReservation_schoolId_idx"       ON "LibraryReservation"("schoolId");
CREATE INDEX "LibraryReservation_catalogueId_idx"    ON "LibraryReservation"("catalogueId");
CREATE INDEX "LibraryReservation_studentId_idx"      ON "LibraryReservation"("studentId");
CREATE INDEX "LibraryReservation_schoolId_status_idx" ON "LibraryReservation"("schoolId", "status");

-- ---------------------------------------------------------------------------
-- LibraryClassroomLoan — teacher classroom borrowing
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryClassroomLoan" (
  "id"                 TEXT        NOT NULL,
  "schoolId"           TEXT        NOT NULL,
  "catalogueId"        TEXT        NOT NULL,
  "teacherId"          TEXT        NOT NULL,
  "classId"            TEXT,
  "copiesCount"        INTEGER     NOT NULL DEFAULT 1,
  "borrowedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedReturnDate" TIMESTAMP(3),
  "returnedAt"         TIMESTAMP(3),
  "notes"              TEXT,
  "createdById"        TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryClassroomLoan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryClassroomLoan"
  ADD CONSTRAINT "LibraryClassroomLoan_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

ALTER TABLE "LibraryClassroomLoan"
  ADD CONSTRAINT "LibraryClassroomLoan_catalogueId_fkey"
  FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE;

CREATE INDEX "LibraryClassroomLoan_schoolId_idx"    ON "LibraryClassroomLoan"("schoolId");
CREATE INDEX "LibraryClassroomLoan_catalogueId_idx" ON "LibraryClassroomLoan"("catalogueId");
CREATE INDEX "LibraryClassroomLoan_teacherId_idx"   ON "LibraryClassroomLoan"("teacherId");

-- ---------------------------------------------------------------------------
-- LibraryCirculationEvent — immutable lifetime copy intelligence log
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryCirculationEvent" (
  "id"            TEXT        NOT NULL,
  "schoolId"      TEXT        NOT NULL,
  "copyId"        TEXT,
  "catalogueId"   TEXT,
  "borrowId"      TEXT,
  "reservationId" TEXT,
  "eventType"     TEXT        NOT NULL,
  "payload"       JSONB,
  "performedById" TEXT,
  "studentId"     TEXT,
  "teacherId"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryCirculationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryCirculationEvent"
  ADD CONSTRAINT "LibraryCirculationEvent_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE;

ALTER TABLE "LibraryCirculationEvent"
  ADD CONSTRAINT "LibraryCirculationEvent_catalogueId_fkey"
  FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE SET NULL;

CREATE INDEX "LibraryCirculationEvent_schoolId_idx"       ON "LibraryCirculationEvent"("schoolId");
CREATE INDEX "LibraryCirculationEvent_copyId_idx"         ON "LibraryCirculationEvent"("copyId");
CREATE INDEX "LibraryCirculationEvent_catalogueId_idx"    ON "LibraryCirculationEvent"("catalogueId");
CREATE INDEX "LibraryCirculationEvent_studentId_idx"      ON "LibraryCirculationEvent"("studentId");
CREATE INDEX "LibraryCirculationEvent_eventType_idx"      ON "LibraryCirculationEvent"("schoolId", "eventType");
CREATE INDEX "LibraryCirculationEvent_createdAt_idx"      ON "LibraryCirculationEvent"("schoolId", "createdAt" DESC);

-- ---------------------------------------------------------------------------
-- Extend LibraryBorrow with return condition and override fields
-- ---------------------------------------------------------------------------

ALTER TABLE "LibraryBorrow"
  ADD COLUMN IF NOT EXISTS "returnCondition"  TEXT,
  ADD COLUMN IF NOT EXISTS "returnType"       TEXT,
  ADD COLUMN IF NOT EXISTS "isOverride"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "overrideReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "overrideById"     TEXT;
