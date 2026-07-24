# Assessment Framework — Design Notes & Gap Registry

_Last updated: 2026-07-18_

This document records every deliberate design decision and every known gap
that must be resolved before the assessment UI can be built. Read this before
touching the schema or writing API routes.

---

## 1. Why three separate hierarchy trees instead of one self-referential table

A single `AssessmentNode(parentId?)` table is tempting but creates three
problems:

1. **No DB-enforced depth limit** — a "paper" could accidentally be nested
   under a "sub-strand," corrupting queries that assume fixed depth.
2. **Messy queries** — every join becomes a recursive CTE; fixed-depth tables
   let you write simple two-table joins.
3. **Ambiguous constraints** — unique constraints on `(frameworkId, name)` are
   meaningful at each level independently; a flat tree merges all levels into
   one namespace.

**Decision:** `Paper` (8-4-4), `LearningArea → Strand → SubStrand` (CBC), and
`CompetencyUnit → CompetencyElement → PerformanceCriterion` (CBE) are each
their own fixed-depth table family.

---

## 2. Polymorphic result payload — three nullable columns + discriminator

`AssessmentItem` stores three nullable result columns:

| Column             | Framework | Type                     |
|--------------------|-----------|--------------------------|
| `numericScore`     | 8-4-4     | `Float`                  |
| `performanceLevel` | CBC       | `PerformanceLevel` enum  |
| `competencyStatus` | CBE       | `CompetencyStatus` enum  |

Exactly one is non-null per row, enforced by a DB CHECK constraint in the
migration (Prisma doesn't emit CHECK constraints from the schema file).

Alternative considered: separate tables per framework. Rejected because it
would require different API endpoints, different ORM queries, and different
report generators for what is conceptually the same operation.

---

## 3. Scoped RBAC — `AssessmentRole` vs `StaffRole/RolePermission`

The existing `StaffRole/RolePermission` system grants module-level access
(e.g., "can view ASSESSMENTS"). `AssessmentRole` is a parallel, finer-grained
layer that grants a teacher a **role within a specific scope node**:

| Scope          | FK populated         | Example                                  |
|----------------|----------------------|------------------------------------------|
| Subject (8-4-4)| `subjectId`          | Mr. Otieno: SUBJECT_TEACHER for Maths    |
| Learning Area  | `learningAreaId`     | Ms. Njeri: HOD for Integrated Science    |
| Competency Unit| `competencyUnitId`   | Mr. Barasa: EXAM_OFFICER for "ICT Unit 1"|
| School-wide    | all nulls            | Principal: DIRECTOR                      |

A DB CHECK constraint enforces at most one scope FK is non-null per row.

**Note:** `PARENT_VIEWER` role is intentionally included in the enum but the
`AssessmentRole` table references `Teacher`, not `User`. Before parents can
be granted view access, a separate `StudentParentLink` or similar join table
is needed (see Gap #4 below).

---

## 4. Known gaps — must resolve before UI

### Gap 1 — `Student` has no `gradeLevel` field

`SchoolClass.form` uses the 8-4-4 integer (1–4). CBC learners are in Grades
1–9 / PP1–PP2; CBE learners are in cohorts. You cannot currently filter
"Grade 7 CBC assessment items" without an additional column or a separate
class-type tag.

**Required action:** Add `gradeLevel String?` to `Student`, or add a
`frameworkType FrameworkType?` tag to `SchoolClass` so CBC/CBE classes are
distinguishable from 8-4-4 classes. A new migration is needed.

### Gap 2 — `SchoolClass.form` has 8-4-4 semantics

The `form Int` column and `@@index([schoolId, form])` are semantically
correct for 8-4-4 but misleading for CBC/CBE. This doesn't break anything
today (it's just a number) but will confuse future queries.

**Required action:** Add a `frameworkType FrameworkType?` column to
`SchoolClass` so CBC/CBE classes carry their own label. Existing rows default
to `EIGHT_FOUR_FOUR`. This is a nullable additive column — non-breaking.

### Gap 3 — `Teacher.primaryDepartmentId` is a single FK

CBC Learning Area scope and CBE Competency Unit scope both require a teacher
to be associated with multiple scope nodes. The `AssessmentRole` table handles
this for assessment purposes, but `Teacher.primaryDepartmentId` still drives
timetable and HOD logic. These two systems will diverge as CBC/CBE expand.

**Required action:** No schema change needed today — `AssessmentRole` is
sufficient for assessment scoping. Document that timetable-teacher assignment
(via `TeacherSubject` / `ClassSubjectTeacher`) must eventually be decoupled
from assessment scoping.

### Gap 4 — `PARENT_VIEWER` role has no `User` FK in `AssessmentRole`

`AssessmentRole.teacherId` is a `Teacher` FK. Parents are not teachers. The
`PARENT_VIEWER` role type exists in the enum but cannot currently be used
because there is no `parentId` / `userId` column on `AssessmentRole`.

**Required action:** Either add `parentUserId String?` to `AssessmentRole`
(with `User` FK, set-null on delete), or create a separate
`ParentAssessmentAccess` join table. The former is simpler; the latter is
cleaner. Decide before building parent-facing UI.

### Gap 5 — No `StudentProgrammeEnrolment` table

CBC and CBE assessment items reference `learningAreaId` / `competencyUnitId`
scoped to a framework, but there is no table that records which framework a
specific student is enrolled in. Currently, framework membership is inferred
from `SchoolClass` — all students in a class share its framework.

**Required action:** If a school runs mixed-framework classes (rare but legal
under KNEC transitional rules), add a `StudentProgrammeEnrolment` table with
`(studentId, frameworkId, academicYear)`. Until then, the class-level
inference is sufficient.

### Gap 6 — `AssessmentPeriod.isCurrent` is not enforced as school-scoped singleton

The old `ExamPeriod.isCurrent` enforcement (update-many to unset others in a
transaction) was in the API layer, not the schema. `AssessmentPeriod` inherits
the same pattern — the API that sets `isCurrent = true` must do so inside a
transaction that first unsets all other current periods for the same
`(schoolId, frameworkId)`.

**Required action:** Document this in the API route when it's built. Consider
a DB partial unique index `WHERE isCurrent = true` as a belt-and-suspenders
guard (PostgreSQL supports this; Prisma does not emit it from the schema
natively — add it in a migration).

---

## 5. Migration notes

The migration `20260718000000_add_assessment_framework` is **destructive** in
Part A: it drops `Result`, `FormSubjectExpectation`, and `ExamPeriod`. On a
production database:

1. Run a data export of all `Result` and `ExamPeriod` rows before applying.
2. Apply the migration.
3. Re-import historical data as `AssessmentItem` rows using a one-off script.

The `Module` enum additions (`ASSESSMENTS`, `ASSESSMENT_FRAMEWORK`) are
additive and safe. The old `EXAM_PERIODS` and `RESULTS` enum values are
retained in the enum for backward compatibility with any existing
`RolePermission` rows — they are logically deprecated and should be pruned in
a follow-up migration after all schools have been migrated.

---

## 6. What's complete

| Deliverable                        | Status     |
|------------------------------------|------------|
| `AssessmentFramework` model        | ✅ Done    |
| `AssessmentPeriod` model           | ✅ Done    |
| 8-4-4 hierarchy (Paper)            | ✅ Done    |
| CBC hierarchy (LA → Strand → SS)   | ✅ Done    |
| CBE hierarchy (CU → Elem → Crit)   | ✅ Done    |
| `AssessmentItem` polymorphic table | ✅ Done    |
| `AssessmentRole` scoped RBAC       | ✅ Done    |
| Migration SQL                      | ✅ Done    |
| CHECK constraints                  | ✅ Done    |
| `Module` enum extended             | ✅ Done    |
| `permissions.ts` updated           | ✅ Done    |
| Demo seed updated (8-4-4 data)     | ✅ Done    |
| CBC/CBE seed data                  | ⬜ Not yet |
| Assessment API routes              | ⬜ Not yet |
| Assessment UI pages                | ⬜ Not yet |
| Parent access model (Gap #4)       | ⬜ Not yet |
| `SchoolClass.frameworkType` field  | ⬜ Not yet |
