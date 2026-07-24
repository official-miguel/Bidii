-- ============================================================================
-- Migration: Library Management System v2 — Enterprise Grade
-- Adds LibraryCatalogue, LibraryCopy, new enums, extends LibrarySettings,
-- LibraryCard, and LibraryBorrow.
-- Backward-compatible: existing LibraryBook rows are untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

CREATE TYPE "LibraryIdentMethod" AS ENUM ('MANUAL', 'QR_CAMERA', 'QR_HARDWARE');
CREATE TYPE "LibraryCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ALUMNI', 'TRANSFERRED');
CREATE TYPE "LibraryCategory" AS ENUM (
  'TEXTBOOK', 'REFERENCE', 'FICTION', 'NON_FICTION', 'PERIODICAL',
  'DICTIONARY', 'ATLAS', 'NOVEL', 'SCIENCE', 'MATHEMATICS',
  'HUMANITIES', 'LANGUAGES', 'OTHER'
);
CREATE TYPE "LibraryCopyCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'LOST');
CREATE TYPE "LibraryCopyStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'RESERVED', 'UNDER_REPAIR', 'ARCHIVED');

-- ---------------------------------------------------------------------------
-- Extend LibrarySettings
-- ---------------------------------------------------------------------------

ALTER TABLE "LibrarySettings"
  ADD COLUMN IF NOT EXISTS "maxRenewals"           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "identificationMethod"  "LibraryIdentMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "barcodeEnabled"        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "eligibleFromForm"      INTEGER,
  ADD COLUMN IF NOT EXISTS "cardValidityDays"      INTEGER,
  ADD COLUMN IF NOT EXISTS "overdueAlertDays"      INTEGER NOT NULL DEFAULT 7;

-- ---------------------------------------------------------------------------
-- LibraryCatalogue — shared catalogue record per (title + edition + form)
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryCatalogue" (
  "id"            TEXT        NOT NULL,
  "schoolId"      TEXT        NOT NULL,
  "title"         TEXT        NOT NULL,
  "bookNumber"    TEXT,
  "subject"       TEXT,
  "form"          INTEGER,
  "author"        TEXT,
  "publisher"     TEXT,
  "edition"       TEXT,
  "isbn"          TEXT,
  "category"      "LibraryCategory" NOT NULL DEFAULT 'TEXTBOOK',
  "shelf"         TEXT,
  "shelfRow"      TEXT,
  "language"      TEXT        NOT NULL DEFAULT 'English',
  "publishYear"   INTEGER,
  "purchaseDate"  TIMESTAMP(3),
  "costPerCopy"   DOUBLE PRECISION,
  "totalCopies"   INTEGER     NOT NULL DEFAULT 0,
  "archivedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LibraryCatalogue_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryCatalogue"
  ADD CONSTRAINT "LibraryCatalogue_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LibraryCatalogue_school_bookNumber" ON "LibraryCatalogue"("schoolId", "bookNumber")
  WHERE "bookNumber" IS NOT NULL;

CREATE INDEX "LibraryCatalogue_schoolId_idx"      ON "LibraryCatalogue"("schoolId");
CREATE INDEX "LibraryCatalogue_subject_idx"        ON "LibraryCatalogue"("schoolId", "subject");
CREATE INDEX "LibraryCatalogue_form_idx"            ON "LibraryCatalogue"("schoolId", "form");
CREATE INDEX "LibraryCatalogue_category_idx"        ON "LibraryCatalogue"("schoolId", "category");
CREATE INDEX "LibraryCatalogue_shelf_idx"           ON "LibraryCatalogue"("schoolId", "shelf");
CREATE INDEX "LibraryCatalogue_title_idx"           ON "LibraryCatalogue"("schoolId", "title");

-- ---------------------------------------------------------------------------
-- LibraryCopy — individual physical copy of a catalogue entry
-- ---------------------------------------------------------------------------

CREATE TABLE "LibraryCopy" (
  "id"                TEXT        NOT NULL,
  "schoolId"          TEXT        NOT NULL,
  "catalogueId"       TEXT        NOT NULL,
  "accessionNumber"   TEXT        NOT NULL,
  "qrCode"            TEXT,
  "barcode"           TEXT,
  "condition"         "LibraryCopyCondition" NOT NULL DEFAULT 'GOOD',
  "status"            "LibraryCopyStatus"   NOT NULL DEFAULT 'AVAILABLE',
  "acquisitionDate"   TIMESTAMP(3),
  "cost"              DOUBLE PRECISION,
  "archivedAt"        TIMESTAMP(3),
  "archiveReason"     TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LibraryCopy"
  ADD CONSTRAINT "LibraryCopy_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryCopy"
  ADD CONSTRAINT "LibraryCopy_catalogueId_fkey"
  FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LibraryCopy_school_accessionNumber" ON "LibraryCopy"("schoolId", "accessionNumber");
CREATE UNIQUE INDEX "LibraryCopy_qrCode_key"             ON "LibraryCopy"("qrCode") WHERE "qrCode" IS NOT NULL;

CREATE INDEX "LibraryCopy_schoolId_idx"       ON "LibraryCopy"("schoolId");
CREATE INDEX "LibraryCopy_catalogueId_idx"    ON "LibraryCopy"("catalogueId");
CREATE INDEX "LibraryCopy_status_idx"         ON "LibraryCopy"("schoolId", "status");

-- ---------------------------------------------------------------------------
-- Extend LibraryCard — add status, cardNumber, expiry, borrow counts
-- ---------------------------------------------------------------------------

ALTER TABLE "LibraryCard"
  ADD COLUMN IF NOT EXISTS "cardNumber"          TEXT,
  ADD COLUMN IF NOT EXISTS "status"              "LibraryCardStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "suspensionReason"    TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "currentBorrowCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalBorrowCount"    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "LibraryCard_status_idx" ON "LibraryCard"("schoolId", "status");

-- ---------------------------------------------------------------------------
-- Extend LibraryBorrow — add copyId FK and renewalCount
-- ---------------------------------------------------------------------------

ALTER TABLE "LibraryBorrow"
  ADD COLUMN IF NOT EXISTS "copyId"        TEXT,
  ADD COLUMN IF NOT EXISTS "renewalCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notes"         TEXT;

-- bookId becomes nullable (was NOT NULL before) — safe because existing rows
-- already have a bookId, and new v2 borrows use copyId instead.
ALTER TABLE "LibraryBorrow"
  ALTER COLUMN "bookId" DROP NOT NULL;

ALTER TABLE "LibraryBorrow"
  ADD CONSTRAINT "LibraryBorrow_copyId_fkey"
  FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "LibraryBorrow_copyId_idx" ON "LibraryBorrow"("copyId");

-- ---------------------------------------------------------------------------
-- Performance indexes on LibraryBorrow for common dashboard queries
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "LibraryBorrow_active_idx"
  ON "LibraryBorrow"("schoolId") WHERE "returnedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "LibraryBorrow_overdue_idx"
  ON "LibraryBorrow"("schoolId", "dueAt") WHERE "returnedAt" IS NULL AND "fineStoppedAt" IS NULL;
