-- Migration: add_library_management
-- Adds LibrarySettings, LibraryBook, LibraryCard, LibraryBorrow tables
-- and the LIBRARY value to the Module enum.

-- ---------------------------------------------------------------------------
-- 1. Add LIBRARY to the Module enum
-- ---------------------------------------------------------------------------
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'LIBRARY';

-- ---------------------------------------------------------------------------
-- 2. LibrarySettings — one row per school (principal-configurable)
-- ---------------------------------------------------------------------------
CREATE TABLE "LibrarySettings" (
    "schoolId"           TEXT    NOT NULL,
    "maxBooksPerStudent" INTEGER NOT NULL DEFAULT 3,
    "maxBorrowDays"      INTEGER NOT NULL DEFAULT 14,
    "finePerDay"         DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibrarySettings_pkey" PRIMARY KEY ("schoolId")
);

ALTER TABLE "LibrarySettings"
    ADD CONSTRAINT "LibrarySettings_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. LibraryBook — the school's book catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE "LibraryBook" (
    "id"          TEXT         NOT NULL,
    "schoolId"    TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "author"      TEXT,
    "isbn"        TEXT,
    "publisher"   TEXT,
    "publishYear" INTEGER,
    "totalCopies" INTEGER      NOT NULL DEFAULT 1,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryBook_schoolId_isbn_key"
    ON "LibraryBook"("schoolId", "isbn")
    WHERE "isbn" IS NOT NULL;

CREATE INDEX "LibraryBook_schoolId_idx" ON "LibraryBook"("schoolId");

ALTER TABLE "LibraryBook"
    ADD CONSTRAINT "LibraryBook_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. LibraryCard — one per student, auto-created on first borrow
-- ---------------------------------------------------------------------------
CREATE TABLE "LibraryCard" (
    "id"             TEXT             NOT NULL,
    "schoolId"       TEXT             NOT NULL,
    "studentId"      TEXT             NOT NULL,
    "fineBalance"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFinesPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "LibraryCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryCard_studentId_key" ON "LibraryCard"("studentId");
CREATE INDEX "LibraryCard_schoolId_idx" ON "LibraryCard"("schoolId");

ALTER TABLE "LibraryCard"
    ADD CONSTRAINT "LibraryCard_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryCard"
    ADD CONSTRAINT "LibraryCard_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. LibraryBorrow — one borrow event per student per book
-- ---------------------------------------------------------------------------
CREATE TABLE "LibraryBorrow" (
    "id"            TEXT             NOT NULL,
    "schoolId"      TEXT             NOT NULL,
    "cardId"        TEXT             NOT NULL,
    "bookId"        TEXT             NOT NULL,
    "borrowedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"         TIMESTAMP(3)     NOT NULL,
    "returnedAt"    TIMESTAMP(3),
    "fineStoppedAt" TIMESTAMP(3),
    "fineAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "LibraryBorrow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LibraryBorrow_schoolId_idx" ON "LibraryBorrow"("schoolId");
CREATE INDEX "LibraryBorrow_cardId_idx"   ON "LibraryBorrow"("cardId");
CREATE INDEX "LibraryBorrow_bookId_idx"   ON "LibraryBorrow"("bookId");

ALTER TABLE "LibraryBorrow"
    ADD CONSTRAINT "LibraryBorrow_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryBorrow"
    ADD CONSTRAINT "LibraryBorrow_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "LibraryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryBorrow"
    ADD CONSTRAINT "LibraryBorrow_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
