-- Performance indexes for offline sync delta-pull queries.
-- All use IF NOT EXISTS — safe to apply on databases with existing data.
-- The schema already defines @@index([classId, date]) on Attendance via
-- Prisma, so that index already exists in the DB. The three below are new.

-- Speeds up GET /api/sync/pull?domain=attendance (filter by schoolId + updatedAt)
CREATE INDEX IF NOT EXISTS "Attendance_schoolId_updatedAt_idx"
  ON "Attendance"("schoolId", "updatedAt");

-- Speeds up GET /api/sync/pull?domain=students (filter by schoolId + updatedAt)
CREATE INDEX IF NOT EXISTS "Student_schoolId_updatedAt_idx"
  ON "Student"("schoolId", "updatedAt");

-- Speeds up GET /api/sync/pull?domain=assessmentItems (school + period + recency)
CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_periodId_updatedAt_idx"
  ON "AssessmentItem"("schoolId", "periodId", "updatedAt");
