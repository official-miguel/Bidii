-- Migration: 20260723000000_scale_indexes
-- Removed CONCURRENTLY keyword — Prisma wraps migrations in transactions,
-- and CONCURRENTLY cannot run inside a transaction block.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Student_fullName_trgm_idx"
  ON "Student" USING GIN ("fullName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_subjectId_periodId_idx"
  ON "AssessmentItem"("schoolId", "subjectId", "periodId");

CREATE INDEX IF NOT EXISTS "SchoolClass_schoolId_form_idx"
  ON "SchoolClass"("schoolId", "form");

CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_enteredById_periodId_idx"
  ON "AssessmentItem"("schoolId", "enteredById", "periodId");

CREATE INDEX IF NOT EXISTS "Student_schoolId_classId_idx"
  ON "Student"("schoolId", "classId");
