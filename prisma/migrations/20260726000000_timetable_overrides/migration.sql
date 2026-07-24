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
