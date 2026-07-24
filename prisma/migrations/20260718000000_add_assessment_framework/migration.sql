-- Migration: 20260718000000_add_assessment_framework
--
-- What this migration does:
--
--  PART A — Remove the old exam/results layer
--    1. Drop Result (depends on ExamPeriod and Subject)
--    2. Drop FormSubjectExpectation
--    3. Drop ExamPeriod
--    4. Drop enum ExamType, ExamCategory (now unused)
--
--  PART B — Extend the Module enum
--    5. Add ASSESSMENTS, ASSESSMENT_FRAMEWORK values
--       (EXAM_PERIODS and RESULTS are kept in the enum for now so that any
--       existing RolePermission rows referencing them don't violate the FK
--       before a separate data-migration removes them. They will be pruned
--       in a follow-up migration once all schools have been migrated.)
--
--  PART C — New assessment enums
--    6. FrameworkType, AssessmentResultKind, PerformanceLevel,
--       CompetencyStatus, AssessmentRoleType
--
--  PART D — New tables (topological order: no FK before its target)
--    7.  AssessmentFramework
--    8.  AssessmentPeriod
--    9.  Paper              (8-4-4 hierarchy, depends on Subject)
--    10. LearningArea       (CBC L1)
--    11. Strand             (CBC L2, depends on LearningArea)
--    12. SubStrand          (CBC L3, depends on Strand)
--    13. CompetencyUnit     (CBE L1)
--    14. CompetencyElement  (CBE L2, depends on CompetencyUnit)
--    15. PerformanceCriterion (CBE L3, depends on CompetencyElement)
--    16. AssessmentItem     (polymorphic leaf, depends on all scope tables)
--    17. AssessmentRole     (scoped RBAC, depends on scope tables)
--
--  PART E — CHECK constraints (Prisma doesn't emit these)
--    18. AssessmentItem result-payload mutex
--    19. AssessmentItem scope mutex
--    20. AssessmentRole scope mutex
--
-- All DDL is wrapped in a single transaction. The migration is idempotent
-- via IF EXISTS / IF NOT EXISTS guards where PostgreSQL allows it.

BEGIN;

-- ===========================================================================
-- PART A — Remove old exam/results layer
-- ===========================================================================

-- 1. Drop Result first (has FKs to ExamPeriod and Subject).
DROP TABLE IF EXISTS "Result";

-- 2. Drop FormSubjectExpectation.
DROP TABLE IF EXISTS "FormSubjectExpectation";

-- 3. Drop ExamPeriod.
DROP TABLE IF EXISTS "ExamPeriod";

-- 4. Drop old enums (safe because no table columns reference them any more).
DROP TYPE IF EXISTS "ExamType";
DROP TYPE IF EXISTS "ExamCategory";

-- ===========================================================================
-- PART B — Extend Module enum
-- ===========================================================================

-- PostgreSQL ENUM ALTER ADD VALUE is non-transactional in PG < 12 but safe
-- in PG 12+. These are additive-only (no rename, no removal) so they are
-- always safe to apply.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ASSESSMENTS'
      AND enumtypid = 'Module'::regtype
  ) THEN
    ALTER TYPE "Module" ADD VALUE 'ASSESSMENTS';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ASSESSMENT_FRAMEWORK'
      AND enumtypid = 'Module'::regtype
  ) THEN
    ALTER TYPE "Module" ADD VALUE 'ASSESSMENT_FRAMEWORK';
  END IF;
END $$;

-- ===========================================================================
-- PART C — New assessment enums
-- ===========================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FrameworkType') THEN
    CREATE TYPE "FrameworkType" AS ENUM (
      'EIGHT_FOUR_FOUR',
      'CBC',
      'CBE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentResultKind') THEN
    CREATE TYPE "AssessmentResultKind" AS ENUM (
      'NUMERIC',
      'PERFORMANCE_LEVEL',
      'COMPETENCY_STATUS'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PerformanceLevel') THEN
    CREATE TYPE "PerformanceLevel" AS ENUM ('EE', 'ME', 'AE', 'BE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompetencyStatus') THEN
    CREATE TYPE "CompetencyStatus" AS ENUM (
      'COMPETENT',
      'NOT_YET_COMPETENT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentRoleType') THEN
    CREATE TYPE "AssessmentRoleType" AS ENUM (
      'SUBJECT_TEACHER',
      'CLASS_TEACHER',
      'HOD',
      'EXAM_OFFICER',
      'DIRECTOR',
      'PARENT_VIEWER'
    );
  END IF;
END $$;

-- ===========================================================================
-- PART D — New tables
-- ===========================================================================

-- 7. AssessmentFramework -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AssessmentFramework" (
  "id"           TEXT        NOT NULL,
  "schoolId"     TEXT        NOT NULL,
  "type"         "FrameworkType" NOT NULL,
  "label"        TEXT        NOT NULL,
  "academicYear" TEXT        NOT NULL,
  "isActive"     BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentFramework_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentFramework_schoolId_type_academicYear_key"
    UNIQUE ("schoolId", "type", "academicYear"),
  CONSTRAINT "AssessmentFramework_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AssessmentFramework_schoolId_idx"
  ON "AssessmentFramework"("schoolId");

-- 8. AssessmentPeriod ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AssessmentPeriod" (
  "id"           TEXT         NOT NULL,
  "schoolId"     TEXT         NOT NULL,
  "frameworkId"  TEXT         NOT NULL,
  "name"         TEXT         NOT NULL,
  "academicYear" TEXT         NOT NULL,
  "term"         INTEGER,
  "weight"       DOUBLE PRECISION NOT NULL DEFAULT 1,
  "maxMarks"     DOUBLE PRECISION,
  "isCurrent"    BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentPeriod_schoolId_frameworkId_name_academicYear_key"
    UNIQUE ("schoolId", "frameworkId", "name", "academicYear"),
  CONSTRAINT "AssessmentPeriod_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentPeriod_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AssessmentPeriod_schoolId_frameworkId_idx"
  ON "AssessmentPeriod"("schoolId", "frameworkId");

-- 9. Paper (8-4-4: Subject → Paper) ------------------------------------------
CREATE TABLE IF NOT EXISTS "Paper" (
  "id"          TEXT         NOT NULL,
  "schoolId"    TEXT         NOT NULL,
  "frameworkId" TEXT         NOT NULL,
  "subjectId"   TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "code"        TEXT,
  "maxMarks"    DOUBLE PRECISION NOT NULL DEFAULT 100,
  "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Paper_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Paper_frameworkId_subjectId_name_key"
    UNIQUE ("frameworkId", "subjectId", "name"),
  CONSTRAINT "Paper_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "Paper_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE,
  CONSTRAINT "Paper_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Paper_schoolId_frameworkId_idx"
  ON "Paper"("schoolId", "frameworkId");
CREATE INDEX IF NOT EXISTS "Paper_subjectId_idx"
  ON "Paper"("subjectId");

-- 10. LearningArea (CBC L1) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "LearningArea" (
  "id"               TEXT         NOT NULL,
  "schoolId"         TEXT         NOT NULL,
  "frameworkId"      TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "code"             TEXT,
  -- applicableGrades is an integer array, e.g. {4,5,6,7,8,9}
  "applicableGrades" INTEGER[]    NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LearningArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningArea_frameworkId_name_key"
    UNIQUE ("frameworkId", "name"),
  CONSTRAINT "LearningArea_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "LearningArea_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LearningArea_schoolId_frameworkId_idx"
  ON "LearningArea"("schoolId", "frameworkId");

-- 11. Strand (CBC L2) ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Strand" (
  "id"             TEXT         NOT NULL,
  "schoolId"       TEXT         NOT NULL,
  "learningAreaId" TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "code"           TEXT,
  "sortOrder"      INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Strand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Strand_learningAreaId_name_key"
    UNIQUE ("learningAreaId", "name"),
  CONSTRAINT "Strand_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "Strand_learningAreaId_fkey"
    FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Strand_schoolId_idx"   ON "Strand"("schoolId");
CREATE INDEX IF NOT EXISTS "Strand_learningAreaId_idx" ON "Strand"("learningAreaId");

-- 12. SubStrand (CBC L3) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SubStrand" (
  "id"        TEXT         NOT NULL,
  "schoolId"  TEXT         NOT NULL,
  "strandId"  TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "code"      TEXT,
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubStrand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubStrand_strandId_name_key"
    UNIQUE ("strandId", "name"),
  CONSTRAINT "SubStrand_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "SubStrand_strandId_fkey"
    FOREIGN KEY ("strandId") REFERENCES "Strand"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SubStrand_schoolId_idx" ON "SubStrand"("schoolId");
CREATE INDEX IF NOT EXISTS "SubStrand_strandId_idx" ON "SubStrand"("strandId");

-- 13. CompetencyUnit (CBE L1) --------------------------------------------------
CREATE TABLE IF NOT EXISTS "CompetencyUnit" (
  "id"          TEXT         NOT NULL,
  "schoolId"    TEXT         NOT NULL,
  "frameworkId" TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "code"        TEXT,
  "credits"     INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetencyUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetencyUnit_frameworkId_name_key"
    UNIQUE ("frameworkId", "name"),
  CONSTRAINT "CompetencyUnit_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "CompetencyUnit_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CompetencyUnit_schoolId_frameworkId_idx"
  ON "CompetencyUnit"("schoolId", "frameworkId");

-- 14. CompetencyElement (CBE L2) -----------------------------------------------
CREATE TABLE IF NOT EXISTS "CompetencyElement" (
  "id"               TEXT         NOT NULL,
  "schoolId"         TEXT         NOT NULL,
  "competencyUnitId" TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "code"             TEXT,
  "sortOrder"        INTEGER      NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetencyElement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetencyElement_competencyUnitId_name_key"
    UNIQUE ("competencyUnitId", "name"),
  CONSTRAINT "CompetencyElement_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "CompetencyElement_competencyUnitId_fkey"
    FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CompetencyElement_schoolId_idx"
  ON "CompetencyElement"("schoolId");
CREATE INDEX IF NOT EXISTS "CompetencyElement_competencyUnitId_idx"
  ON "CompetencyElement"("competencyUnitId");

-- 15. PerformanceCriterion (CBE L3) -------------------------------------------
CREATE TABLE IF NOT EXISTS "PerformanceCriterion" (
  "id"        TEXT         NOT NULL,
  "schoolId"  TEXT         NOT NULL,
  "elementId" TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "code"      TEXT,
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PerformanceCriterion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PerformanceCriterion_elementId_name_key"
    UNIQUE ("elementId", "name"),
  CONSTRAINT "PerformanceCriterion_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "PerformanceCriterion_elementId_fkey"
    FOREIGN KEY ("elementId") REFERENCES "CompetencyElement"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PerformanceCriterion_schoolId_idx"
  ON "PerformanceCriterion"("schoolId");
CREATE INDEX IF NOT EXISTS "PerformanceCriterion_elementId_idx"
  ON "PerformanceCriterion"("elementId");

-- 16. AssessmentItem (polymorphic result record) -------------------------------
--
-- Three nullable result columns; exactly one is non-null (enforced by CHECK
-- constraint in Part E). All scope FK columns are also nullable; the correct
-- subset is populated per framework.
CREATE TABLE IF NOT EXISTS "AssessmentItem" (
  "id"               TEXT         NOT NULL,
  "schoolId"         TEXT         NOT NULL,
  "frameworkId"      TEXT         NOT NULL,
  "periodId"         TEXT         NOT NULL,
  "studentId"        TEXT         NOT NULL,
  "enteredById"      TEXT,

  -- discriminator
  "resultKind"       "AssessmentResultKind" NOT NULL,

  -- result payload (mutex enforced by CHECK below)
  "numericScore"     DOUBLE PRECISION,
  "performanceLevel" "PerformanceLevel",
  "competencyStatus" "CompetencyStatus",

  -- 8-4-4 scope
  "subjectId"        TEXT,
  "paperId"          TEXT,

  -- CBC scope
  "learningAreaId"   TEXT,
  "strandId"         TEXT,
  "subStrandId"      TEXT,

  -- CBE scope
  "competencyUnitId" TEXT,
  "elementId"        TEXT,
  "criterionId"      TEXT,

  -- metadata
  "comment"          TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id"),

  -- natural uniqueness per scope type
  CONSTRAINT "item_paper"
    UNIQUE ("studentId", "periodId", "paperId"),
  CONSTRAINT "item_substrand"
    UNIQUE ("studentId", "periodId", "subStrandId"),
  CONSTRAINT "item_criterion"
    UNIQUE ("studentId", "periodId", "criterionId"),
  CONSTRAINT "item_subject_paper"
    UNIQUE ("studentId", "periodId", "subjectId", "paperId"),

  -- foreign keys
  CONSTRAINT "AssessmentItem_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentItem_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentItem_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "AssessmentPeriod"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentItem_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentItem_enteredById_fkey"
    FOREIGN KEY ("enteredById") REFERENCES "Teacher"("id") ON DELETE SET NULL,
  CONSTRAINT "AssessmentItem_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id"),
  CONSTRAINT "AssessmentItem_paperId_fkey"
    FOREIGN KEY ("paperId") REFERENCES "Paper"("id"),
  CONSTRAINT "AssessmentItem_learningAreaId_fkey"
    FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id"),
  CONSTRAINT "AssessmentItem_strandId_fkey"
    FOREIGN KEY ("strandId") REFERENCES "Strand"("id"),
  CONSTRAINT "AssessmentItem_subStrandId_fkey"
    FOREIGN KEY ("subStrandId") REFERENCES "SubStrand"("id"),
  CONSTRAINT "AssessmentItem_competencyUnitId_fkey"
    FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id"),
  CONSTRAINT "AssessmentItem_elementId_fkey"
    FOREIGN KEY ("elementId") REFERENCES "CompetencyElement"("id"),
  CONSTRAINT "AssessmentItem_criterionId_fkey"
    FOREIGN KEY ("criterionId") REFERENCES "PerformanceCriterion"("id")
);

CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_frameworkId_periodId_idx"
  ON "AssessmentItem"("schoolId", "frameworkId", "periodId");
CREATE INDEX IF NOT EXISTS "AssessmentItem_studentId_idx"
  ON "AssessmentItem"("studentId");
CREATE INDEX IF NOT EXISTS "AssessmentItem_enteredById_idx"
  ON "AssessmentItem"("enteredById");
CREATE INDEX IF NOT EXISTS "AssessmentItem_learningAreaId_periodId_idx"
  ON "AssessmentItem"("learningAreaId", "periodId");
CREATE INDEX IF NOT EXISTS "AssessmentItem_competencyUnitId_periodId_idx"
  ON "AssessmentItem"("competencyUnitId", "periodId");

-- 17. AssessmentRole (scoped RBAC) --------------------------------------------
CREATE TABLE IF NOT EXISTS "AssessmentRole" (
  "id"               TEXT         NOT NULL,
  "schoolId"         TEXT         NOT NULL,
  "frameworkId"      TEXT         NOT NULL,
  "teacherId"        TEXT         NOT NULL,
  "role"             "AssessmentRoleType" NOT NULL,

  -- scope (at most one non-null — enforced by CHECK below)
  "subjectId"        TEXT,
  "learningAreaId"   TEXT,
  "competencyUnitId" TEXT,

  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentRole_frameworkId_teacherId_role_scope_key"
    UNIQUE ("frameworkId", "teacherId", "role", "subjectId", "learningAreaId", "competencyUnitId"),

  CONSTRAINT "AssessmentRole_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentRole_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentRole_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE,
  CONSTRAINT "AssessmentRole_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL,
  CONSTRAINT "AssessmentRole_learningAreaId_fkey"
    FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE SET NULL,
  CONSTRAINT "AssessmentRole_competencyUnitId_fkey"
    FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "AssessmentRole_schoolId_frameworkId_idx"
  ON "AssessmentRole"("schoolId", "frameworkId");
CREATE INDEX IF NOT EXISTS "AssessmentRole_teacherId_idx"
  ON "AssessmentRole"("teacherId");

-- ===========================================================================
-- PART E — CHECK constraints
-- (Prisma generates none of these; they are hand-written here.)
-- ===========================================================================

-- 18. AssessmentItem — result payload mutex
--     Exactly one of numericScore / performanceLevel / competencyStatus must
--     be non-null, and it must agree with resultKind.
--
--     Rule: the column indicated by resultKind is non-null; the other two
--     are null. Expressed as:
--       (resultKind='NUMERIC'             AND numericScore IS NOT NULL
--                                         AND performanceLevel IS NULL
--                                         AND competencyStatus IS NULL)
--     OR (resultKind='PERFORMANCE_LEVEL'  AND numericScore IS NULL
--                                         AND performanceLevel IS NOT NULL
--                                         AND competencyStatus IS NULL)
--     OR (resultKind='COMPETENCY_STATUS'  AND numericScore IS NULL
--                                         AND performanceLevel IS NULL
--                                         AND competencyStatus IS NOT NULL)
ALTER TABLE "AssessmentItem"
  ADD CONSTRAINT "chk_assessment_item_result_payload_mutex"
  CHECK (
    (
      "resultKind" = 'NUMERIC'
      AND "numericScore"     IS NOT NULL
      AND "performanceLevel" IS NULL
      AND "competencyStatus" IS NULL
    )
    OR (
      "resultKind" = 'PERFORMANCE_LEVEL'
      AND "numericScore"     IS NULL
      AND "performanceLevel" IS NOT NULL
      AND "competencyStatus" IS NULL
    )
    OR (
      "resultKind" = 'COMPETENCY_STATUS'
      AND "numericScore"     IS NULL
      AND "performanceLevel" IS NULL
      AND "competencyStatus" IS NOT NULL
    )
  );

-- 19. AssessmentItem — scope mutex
--     At most one "scope family" is active per row. The three families are:
--       8-4-4 : subjectId or paperId is set (paperId implies subjectId)
--       CBC   : learningAreaId (and optionally strandId, subStrandId)
--       CBE   : competencyUnitId (and optionally elementId, criterionId)
--
--     The rule: the three family "roots" are mutually exclusive. A row may
--     have a root plus its children (paper is a child of subject, subStrand
--     is a child of strand, criterion is a child of element) but must not
--     mix roots across families.
--
--     Shorthand: at most one of (subjectId, learningAreaId, competencyUnitId)
--     is non-null, AND children only appear with their parent.
ALTER TABLE "AssessmentItem"
  ADD CONSTRAINT "chk_assessment_item_scope_mutex"
  CHECK (
    -- at most one root is set
    (
      ("subjectId"        IS NOT NULL)::int
    + ("learningAreaId"   IS NOT NULL)::int
    + ("competencyUnitId" IS NOT NULL)::int
    ) <= 1
    -- 8-4-4 children require their root (paperId requires subjectId)
    AND ("paperId"     IS NULL OR "subjectId"        IS NOT NULL)
    -- CBC children require their root chain
    AND ("strandId"    IS NULL OR "learningAreaId"   IS NOT NULL)
    AND ("subStrandId" IS NULL OR "strandId"         IS NOT NULL)
    -- CBE children require their root chain
    AND ("elementId"   IS NULL OR "competencyUnitId" IS NOT NULL)
    AND ("criterionId" IS NULL OR "elementId"        IS NOT NULL)
  );

-- 20. AssessmentRole — scope mutex
--     A role row targets exactly one scope family: subject, learning area,
--     competency unit, or school-wide (all null). Cross-family grants are
--     not meaningful and indicate a data error.
ALTER TABLE "AssessmentRole"
  ADD CONSTRAINT "chk_assessment_role_scope_mutex"
  CHECK (
    (
      ("subjectId"        IS NOT NULL)::int
    + ("learningAreaId"   IS NOT NULL)::int
    + ("competencyUnitId" IS NOT NULL)::int
    ) <= 1
  );

COMMIT;
