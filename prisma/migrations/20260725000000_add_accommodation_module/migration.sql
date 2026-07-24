-- Migration: Add Accommodation Management Module
-- Creates all enums, tables, and indexes for the boarding/accommodation module.

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "BoardingType" AS ENUM ('DAY_ONLY', 'BOARDING_ONLY', 'DAY_AND_BOARDING');
CREATE TYPE "GenderPolicy" AS ENUM ('BOYS_ONLY', 'GIRLS_ONLY', 'MIXED');
CREATE TYPE "DormStructure" AS ENUM ('OPEN_HALL', 'CUBICLE_BASED');
CREATE TYPE "AllocationPolicy" AS ENUM ('RESTRICTED_BY_FORM', 'MIXED_FORMS');
CREATE TYPE "BedType" AS ENUM ('SINGLE', 'DOUBLE_DECKER', 'CUSTOM');
CREATE TYPE "BedPosition" AS ENUM ('UPPER', 'LOWER');
CREATE TYPE "DormStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'CLOSED');
CREATE TYPE "AllocationStatus" AS ENUM ('CURRENT', 'VACATED', 'TRANSFERRED');

-- ── Add ACCOMMODATION to Module enum ──────────────────────────────────────
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'ACCOMMODATION';

-- ── AccommodationSettings ─────────────────────────────────────────────────

CREATE TABLE "AccommodationSettings" (
    "schoolId"                TEXT            NOT NULL,
    "boardingType"            "BoardingType"  NOT NULL DEFAULT 'DAY_AND_BOARDING',
    "schoolGenderPolicy"      "GenderPolicy"  NOT NULL DEFAULT 'MIXED',
    "enableDormCaptains"      BOOLEAN         NOT NULL DEFAULT true,
    "enableTransfers"         BOOLEAN         NOT NULL DEFAULT true,
    "defaultAllocationPolicy" "AllocationPolicy" NOT NULL DEFAULT 'MIXED_FORMS',
    "occupancyWarningPct"     INTEGER         NOT NULL DEFAULT 90,
    "bedTrackingEnabled"      BOOLEAN         NOT NULL DEFAULT true,
    "analyticsEnabled"        BOOLEAN         NOT NULL DEFAULT true,
    "notifyOnAllocation"      BOOLEAN         NOT NULL DEFAULT false,
    "updatedAt"               TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "AccommodationSettings_pkey" PRIMARY KEY ("schoolId")
);

ALTER TABLE "AccommodationSettings"
    ADD CONSTRAINT "AccommodationSettings_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Dormitory ─────────────────────────────────────────────────────────────

CREATE TABLE "Dormitory" (
    "id"                    TEXT            NOT NULL,
    "schoolId"              TEXT            NOT NULL,
    "name"                  TEXT            NOT NULL,
    "genderPolicy"          "GenderPolicy"  NOT NULL DEFAULT 'MIXED',
    "structure"             "DormStructure" NOT NULL DEFAULT 'OPEN_HALL',
    "status"                "DormStatus"    NOT NULL DEFAULT 'ACTIVE',
    "totalCapacity"         INTEGER         NOT NULL DEFAULT 0,
    "allocationPolicy"      "AllocationPolicy" NOT NULL DEFAULT 'MIXED_FORMS',
    "cubiclesInheritPolicy" BOOLEAN         NOT NULL DEFAULT true,
    "description"           TEXT,
    "boardingMasterId"      TEXT,
    "dormCaptainId"         TEXT,
    "createdAt"             TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "Dormitory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dormitory_schoolId_name_key" ON "Dormitory"("schoolId", "name");
CREATE INDEX "Dormitory_schoolId_idx" ON "Dormitory"("schoolId");
CREATE INDEX "Dormitory_schoolId_status_idx" ON "Dormitory"("schoolId", "status");

ALTER TABLE "Dormitory"
    ADD CONSTRAINT "Dormitory_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dormitory"
    ADD CONSTRAINT "Dormitory_boardingMasterId_fkey"
    FOREIGN KEY ("boardingMasterId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dormitory"
    ADD CONSTRAINT "Dormitory_dormCaptainId_fkey"
    FOREIGN KEY ("dormCaptainId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DormPermittedForm ─────────────────────────────────────────────────────

CREATE TABLE "DormPermittedForm" (
    "dormId" TEXT    NOT NULL,
    "form"   INTEGER NOT NULL,

    CONSTRAINT "DormPermittedForm_pkey" PRIMARY KEY ("dormId", "form")
);

CREATE INDEX "DormPermittedForm_dormId_idx" ON "DormPermittedForm"("dormId");

ALTER TABLE "DormPermittedForm"
    ADD CONSTRAINT "DormPermittedForm_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Cubicle ───────────────────────────────────────────────────────────────

CREATE TABLE "Cubicle" (
    "id"               TEXT             NOT NULL,
    "dormId"           TEXT             NOT NULL,
    "schoolId"         TEXT             NOT NULL,
    "name"             TEXT             NOT NULL,
    "capacity"         INTEGER          NOT NULL DEFAULT 4,
    "allocationPolicy" "AllocationPolicy",
    "description"      TEXT,
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "Cubicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cubicle_dormId_name_key" ON "Cubicle"("dormId", "name");
CREATE INDEX "Cubicle_dormId_idx" ON "Cubicle"("dormId");
CREATE INDEX "Cubicle_schoolId_idx" ON "Cubicle"("schoolId");

ALTER TABLE "Cubicle"
    ADD CONSTRAINT "Cubicle_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Cubicle"
    ADD CONSTRAINT "Cubicle_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CubiclePermittedForm ──────────────────────────────────────────────────

CREATE TABLE "CubiclePermittedForm" (
    "cubicleId" TEXT    NOT NULL,
    "form"      INTEGER NOT NULL,

    CONSTRAINT "CubiclePermittedForm_pkey" PRIMARY KEY ("cubicleId", "form")
);

CREATE INDEX "CubiclePermittedForm_cubicleId_idx" ON "CubiclePermittedForm"("cubicleId");

ALTER TABLE "CubiclePermittedForm"
    ADD CONSTRAINT "CubiclePermittedForm_cubicleId_fkey"
    FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Bed ───────────────────────────────────────────────────────────────────

CREATE TABLE "Bed" (
    "id"              TEXT        NOT NULL,
    "schoolId"        TEXT        NOT NULL,
    "dormId"          TEXT        NOT NULL,
    "cubicleId"       TEXT,
    "label"           TEXT        NOT NULL,
    "bedType"         "BedType"   NOT NULL DEFAULT 'SINGLE',
    "customOccupancy" INTEGER,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bed_dormId_label_key" ON "Bed"("dormId", "label");
CREATE INDEX "Bed_dormId_idx" ON "Bed"("dormId");
CREATE INDEX "Bed_cubicleId_idx" ON "Bed"("cubicleId");
CREATE INDEX "Bed_schoolId_idx" ON "Bed"("schoolId");

ALTER TABLE "Bed"
    ADD CONSTRAINT "Bed_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bed"
    ADD CONSTRAINT "Bed_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bed"
    ADD CONSTRAINT "Bed_cubicleId_fkey"
    FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SleepingPosition ──────────────────────────────────────────────────────

CREATE TABLE "SleepingPosition" (
    "id"          TEXT           NOT NULL,
    "schoolId"    TEXT           NOT NULL,
    "bedId"       TEXT           NOT NULL,
    "dormId"      TEXT           NOT NULL,
    "cubicleId"   TEXT,
    "position"    "BedPosition",
    "customLabel" TEXT,
    "isOccupied"  BOOLEAN        NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepingPosition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SleepingPosition_bedId_idx" ON "SleepingPosition"("bedId");
CREATE INDEX "SleepingPosition_dormId_idx" ON "SleepingPosition"("dormId");
CREATE INDEX "SleepingPosition_schoolId_idx" ON "SleepingPosition"("schoolId");

ALTER TABLE "SleepingPosition"
    ADD CONSTRAINT "SleepingPosition_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SleepingPosition"
    ADD CONSTRAINT "SleepingPosition_bedId_fkey"
    FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SleepingPosition"
    ADD CONSTRAINT "SleepingPosition_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SleepingPosition"
    ADD CONSTRAINT "SleepingPosition_cubicleId_fkey"
    FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── AllocationRecord ──────────────────────────────────────────────────────

CREATE TABLE "AllocationRecord" (
    "id"                 TEXT                NOT NULL,
    "schoolId"           TEXT                NOT NULL,
    "studentId"          TEXT                NOT NULL,
    "dormId"             TEXT                NOT NULL,
    "cubicleId"          TEXT,
    "bedId"              TEXT,
    "sleepingPositionId" TEXT,
    "allocationDate"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vacatedDate"        TIMESTAMP(3),
    "status"             "AllocationStatus"  NOT NULL DEFAULT 'CURRENT',
    "notes"              TEXT,
    "allocatedById"      TEXT,
    "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "AllocationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllocationRecord_schoolId_idx" ON "AllocationRecord"("schoolId");
CREATE INDEX "AllocationRecord_studentId_idx" ON "AllocationRecord"("studentId");
CREATE INDEX "AllocationRecord_dormId_idx" ON "AllocationRecord"("dormId");
CREATE INDEX "AllocationRecord_studentId_status_idx" ON "AllocationRecord"("studentId", "status");
CREATE INDEX "AllocationRecord_schoolId_status_idx" ON "AllocationRecord"("schoolId", "status");

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_cubicleId_fkey"
    FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_bedId_fkey"
    FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_sleepingPositionId_fkey"
    FOREIGN KEY ("sleepingPositionId") REFERENCES "SleepingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AllocationRecord"
    ADD CONSTRAINT "AllocationRecord_allocatedById_fkey"
    FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
