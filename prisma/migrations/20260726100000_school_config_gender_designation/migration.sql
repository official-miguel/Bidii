-- ── School Configuration fields ─────────────────────────────────────────────
ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "logoUrl"    TEXT,
  ADD COLUMN IF NOT EXISTS "stampUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "motto"      TEXT,
  ADD COLUMN IF NOT EXISTS "boardingType" TEXT NOT NULL DEFAULT 'DAY_AND_BOARDING',
  ADD COLUMN IF NOT EXISTS "genderPolicy" TEXT NOT NULL DEFAULT 'MIXED',
  ADD COLUMN IF NOT EXISTS "autoAllocateDorms" BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Student gender ────────────────────────────────────────────────────────────
ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- ── Teacher designation ───────────────────────────────────────────────────────
ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "designation" TEXT;
