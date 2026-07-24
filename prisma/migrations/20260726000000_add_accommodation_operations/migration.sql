-- Migration: Add Accommodation Operations — Inspections, Audit Log Extensions, Events
-- Adds DormInspection, DormInspectionItem, and AccommodationEvent models.

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InspectionRating" AS ENUM ('EXCELLENT', 'GOOD', 'SATISFACTORY', 'NEEDS_IMPROVEMENT', 'POOR');
CREATE TYPE "AccomEventType" AS ENUM (
  'ALLOCATED', 'TRANSFERRED', 'VACATED', 'REMOVED',
  'MAINTENANCE_CLOSED', 'MAINTENANCE_REOPENED', 'EMERGENCY_RELOCATION',
  'RESERVED', 'RESERVATION_RELEASED', 'RENOVATION_STARTED', 'RENOVATION_COMPLETED',
  'REASSIGNED', 'STATUS_CHANGED'
);

-- ── DormInspection ─────────────────────────────────────────────────────────

CREATE TABLE "DormInspection" (
    "id"               TEXT               NOT NULL,
    "schoolId"         TEXT               NOT NULL,
    "dormId"           TEXT               NOT NULL,
    "inspectionDate"   TIMESTAMP(3)       NOT NULL,
    "inspectedById"    TEXT,
    "status"           "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "overallRating"    "InspectionRating",
    "overallScore"     DOUBLE PRECISION,
    "notes"            TEXT,
    "recommendations"  TEXT,
    "nextInspectionDate" TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "DormInspection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DormInspection_schoolId_idx" ON "DormInspection"("schoolId");
CREATE INDEX "DormInspection_dormId_idx" ON "DormInspection"("dormId");
CREATE INDEX "DormInspection_schoolId_inspectionDate_idx" ON "DormInspection"("schoolId", "inspectionDate");

ALTER TABLE "DormInspection"
    ADD CONSTRAINT "DormInspection_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DormInspection"
    ADD CONSTRAINT "DormInspection_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DormInspection"
    ADD CONSTRAINT "DormInspection_inspectedById_fkey"
    FOREIGN KEY ("inspectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DormInspectionItem ────────────────────────────────────────────────────

CREATE TABLE "DormInspectionItem" (
    "id"           TEXT               NOT NULL,
    "inspectionId" TEXT               NOT NULL,
    "category"     TEXT               NOT NULL,
    "item"         TEXT               NOT NULL,
    "rating"       "InspectionRating" NOT NULL,
    "score"        DOUBLE PRECISION,
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DormInspectionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DormInspectionItem_inspectionId_idx" ON "DormInspectionItem"("inspectionId");

ALTER TABLE "DormInspectionItem"
    ADD CONSTRAINT "DormInspectionItem_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "DormInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AccommodationEvent — immutable audit log ──────────────────────────────

CREATE TABLE "AccommodationEvent" (
    "id"             TEXT               NOT NULL,
    "schoolId"       TEXT               NOT NULL,
    "dormId"         TEXT,
    "studentId"      TEXT,
    "eventType"      "AccomEventType"   NOT NULL,
    "performedById"  TEXT,
    "fromDormId"     TEXT,
    "toDormId"       TEXT,
    "fromCubicleId"  TEXT,
    "toCubicleId"    TEXT,
    "fromPositionId" TEXT,
    "toPositionId"   TEXT,
    "reason"         TEXT,
    "notes"          TEXT,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationEvent_schoolId_idx" ON "AccommodationEvent"("schoolId");
CREATE INDEX "AccommodationEvent_dormId_idx" ON "AccommodationEvent"("dormId");
CREATE INDEX "AccommodationEvent_studentId_idx" ON "AccommodationEvent"("studentId");
CREATE INDEX "AccommodationEvent_schoolId_createdAt_idx" ON "AccommodationEvent"("schoolId", "createdAt");
CREATE INDEX "AccommodationEvent_schoolId_eventType_idx" ON "AccommodationEvent"("schoolId", "eventType");

ALTER TABLE "AccommodationEvent"
    ADD CONSTRAINT "AccommodationEvent_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccommodationEvent"
    ADD CONSTRAINT "AccommodationEvent_dormId_fkey"
    FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccommodationEvent"
    ADD CONSTRAINT "AccommodationEvent_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccommodationEvent"
    ADD CONSTRAINT "AccommodationEvent_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Extend AllocationRecord with event type ───────────────────────────────

ALTER TABLE "AllocationRecord"
    ADD COLUMN IF NOT EXISTS "eventType" TEXT DEFAULT 'ALLOCATED';

ALTER TABLE "AllocationRecord"
    ADD COLUMN IF NOT EXISTS "reason" TEXT;
