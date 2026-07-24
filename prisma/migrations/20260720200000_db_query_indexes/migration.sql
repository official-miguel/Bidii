-- Migration: 20260720200000_db_query_indexes
--
-- Adds indexes identified by a full query audit of every API route.
-- All use CREATE INDEX IF NOT EXISTS so the migration is safe to re-run
-- and does not fail if an index was already created manually.
--
-- Benchmark rationale is documented per index.

BEGIN;

-- ---------------------------------------------------------------------------
-- AssessmentItem
-- ---------------------------------------------------------------------------

-- 1. (periodId, studentId, resultKind)
--    Used by: report-card, marksheet, all dashboard routes.
--    Pattern: WHERE periodId = ? AND studentId IN (...) AND resultKind = ?
--    The existing (schoolId, frameworkId, periodId) index does not cover
--    the student-IN and resultKind clauses on this hot path.
CREATE INDEX IF NOT EXISTS "AssessmentItem_periodId_studentId_resultKind_idx"
  ON "AssessmentItem"("periodId", "studentId", "resultKind");

-- 2. (subjectId, periodId)
--    Used by: department/analytics (subjectId IN [...] AND periodId = ?)
--             teacher home card entry-count query.
CREATE INDEX IF NOT EXISTS "AssessmentItem_subjectId_periodId_idx"
  ON "AssessmentItem"("subjectId", "periodId");

-- ---------------------------------------------------------------------------
-- Paper
-- ---------------------------------------------------------------------------

-- 3. (frameworkId, subjectId)
--    Used by: marksheet GET (WHERE subjectId=? AND frameworkId=?)
--             report-card (papers WHERE frameworkId=? AND subjectId IN [...])
--             pathway-dashboard (papers WHERE frameworkId=? AND subjectId IN [...])
--    The existing (schoolId, frameworkId) index is not selective enough
--    when the query additionally filters by subjectId.
CREATE INDEX IF NOT EXISTS "Paper_frameworkId_subjectId_idx"
  ON "Paper"("frameworkId", "subjectId");

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

-- 4. (studentId, date)
--    Used by: attendance GET ?studentId=X (full history, ORDER BY date DESC).
--    The existing UNIQUE (studentId, classId, date) can serve equality
--    lookups but the query does WHERE studentId=? with no classId, making
--    the B-tree skip the classId component — a separate (studentId, date)
--    index is needed for this range scan.
CREATE INDEX IF NOT EXISTS "Attendance_studentId_date_idx"
  ON "Attendance"("studentId", "date" DESC);

-- ---------------------------------------------------------------------------
-- Student
-- ---------------------------------------------------------------------------

-- 5. (schoolId, fullName)
--    Used by: GET /api/students?q=<name> (ILIKE search on fullName).
--    PostgreSQL can use this index for prefix scans; the ILIKE + pg_trgm
--    extension would be even better for infix search but requires
--    additional setup — this index at minimum avoids a full table scan
--    when the search is anchored at the start of the name.
CREATE INDEX IF NOT EXISTS "Student_schoolId_fullName_idx"
  ON "Student"("schoolId", "fullName");

-- 6. (schoolId, admissionNumber)
--    Used by: GET /api/students?q=<admNo>&by=admission
--             maxAdmissionNumber() raw query for sequencing.
CREATE INDEX IF NOT EXISTS "Student_schoolId_admissionNumber_idx"
  ON "Student"("schoolId", "admissionNumber");

-- ---------------------------------------------------------------------------
-- AssessmentPeriod
-- ---------------------------------------------------------------------------

-- 7. (schoolId, isCurrent)
--    Used by: teacher home GET (findFirst WHERE isCurrent=true)
--             sync/pull assessmentItems (findFirst WHERE isCurrent=true)
--    Without this index both queries do a full scan of all periods for the
--    school — this is a 1-row lookup that should cost O(1).
CREATE INDEX IF NOT EXISTS "AssessmentPeriod_schoolId_isCurrent_idx"
  ON "AssessmentPeriod"("schoolId", "isCurrent")
  WHERE "isCurrent" = TRUE;

-- ---------------------------------------------------------------------------
-- DisciplineRecord
-- ---------------------------------------------------------------------------

-- 8. (schoolId, studentId)
--    Used by: student profile discipline tab (WHERE schoolId=? AND studentId=?)
--    The existing (studentId, dateOfOffence) index covers queries scoped to
--    a single student but requires a second pass for the schoolId filter;
--    a composite index here allows index-only lookup.
CREATE INDEX IF NOT EXISTS "DisciplineRecord_schoolId_studentId_idx"
  ON "DisciplineRecord"("schoolId", "studentId");

-- ---------------------------------------------------------------------------
-- ReportRemark
-- ---------------------------------------------------------------------------

-- 9. (periodId, studentId)
--    Used by: report-remark GET/PUT for a single student
--             (WHERE schoolId=? AND periodId=? AND studentId=? — unique
--             constraint already exists, but explicit index helps the
--             planner choose it for non-unique lookups like listing all
--             remarks for a student across periods).
CREATE INDEX IF NOT EXISTS "ReportRemark_periodId_studentId_idx"
  ON "ReportRemark"("periodId", "studentId");

COMMIT;
