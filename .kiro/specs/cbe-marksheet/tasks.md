# Implementation Plan: Stage 2 — CBE Assessment Entry

## Overview

All tasks build on the complete Stage 1 (8-4-4) implementation. Tasks 1–3 are schema/migration work with no UI dependencies. Tasks 4–7 are pure utilities or API routes. Tasks 8–10 are React components. Tasks 11–13 are pages and routing wires. Task 14 is the final compile check.

---

## Tasks

- [ ] 1. Schema — add `frameworkType` to `SchoolClass`
  - Add `frameworkType FrameworkType @default(EIGHT_FOUR_FOUR)` to `SchoolClass` in `prisma/schema.prisma`.
  - Create migration `prisma/migrations/20260719000000_add_cbe_class_framework_and_pathway_weight/migration.sql`:
    - `ALTER TABLE "SchoolClass" ADD COLUMN IF NOT EXISTS "frameworkType" "FrameworkType" NOT NULL DEFAULT 'EIGHT_FOUR_FOUR';`
  - _Requirements: 1.1, 1.6_

- [ ] 2. Schema — add `PathwayWeight` table
  - Add `PathwayWeight` model to `prisma/schema.prisma` (fields: id, schoolId, frameworkId, subjectId, sbaWeight, examWeight, sbaMaxMarks, examMaxMarks, createdAt, updatedAt).
  - Add `@@unique([frameworkId, subjectId])` constraint.
  - Add back-relations on `School`, `AssessmentFramework`, `Subject`.
  - Add to the same migration file: `CREATE TABLE IF NOT EXISTS "PathwayWeight" ...` with `CHECK (sbaWeight + examWeight = 1.0)`.
  - _Requirements: 8.1, 8.2_

- [ ] 3. Schema — update class creation API and form
  - `src/app/api/classes/route.ts` (GET): add `frameworkType` to the select.
  - `src/app/api/classes/route.ts` (POST): accept optional `frameworkType` field (default `EIGHT_FOUR_FOUR`); write it to the DB.
  - `src/app/principal/classes/page.tsx`: add a "Curriculum framework" radio/select (8-4-4 / CBE) to the create-class form.
  - `src/app/principal/students/page.tsx`: display a read-only "Framework: 8-4-4" or "Framework: CBE" label next to the class selector in the admit-student form.
  - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [ ] 4. CBE grading utility — `src/lib/assessment/gradingCbe.ts`
  - Pure functions, no Prisma, safe for client and server.
  - Export: `PerformanceLevel` type, `LEVEL_POINTS`, `LEVEL_LABELS`, `levelColour(level)`, `meanAttainment(levels)`, `ALL_LEVELS`.
  - `levelColour` returns Tailwind bg/text classes: EE=green, ME=blue, AE=amber, BE=orange.
  - `meanAttainment` excludes nulls; returns null if no valid entries.
  - _Requirements: 12.4_

- [ ] 5. Offline queue — `src/lib/assessment/cbeOfflineQueue.ts`
  - Client-only module (`'use client'` convention — do NOT import from server code).
  - Opens IndexedDB `bidii_cbe_queue`, store `entries`, keyPath `id`.
  - Export: `enqueue`, `flush`, `pendingCount`, `clearSynced`, `QueueEntry` type.
  - `flush` groups entries by subStrandId; calls `POST /api/assessments/cbe/batch` per group; deletes successes; increments retries on failure; marks `status = 'stuck'` when `retries >= 3`.
  - Handles `navigator.onLine` check before flush attempt.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.8, 9.9, 9.10_

- [ ] 6. API — CBE learning areas endpoint — `src/app/api/assessments/cbe/learning-areas/route.ts`
  - `GET` handler.
  - Find school's active CBE framework (`type = CBE`, `isActive = true`).
  - Fetch LearningArea rows → each with Strand children → each with SubStrand children, all ordered by `sortOrder ASC`.
  - Return response shape from design Section 4.1.
  - Guard: `canReadPeriods(actor)` (any assessment actor).
  - _Requirements: 11.4_

- [ ] 7. API — CBE substrand-sheet, item, and batch endpoints
  - `src/app/api/assessments/cbe/substrand-sheet/route.ts` — GET, query params: `periodId, classId, subStrandId`. Guard: `canViewMarksheet`. Response: rows with `level | null` per student.
  - `src/app/api/assessments/cbe/item/route.ts` — PUT. Body: `{ periodId, studentId, subStrandId, level: PerformanceLevel | null, comment? }`. Guard: `canEnterMarks` (resolve learningAreaId from subStrandId chain). `level = null` → deleteMany on `item_substrand` unique; otherwise upsert with `resultKind = PERFORMANCE_LEVEL`.
  - `src/app/api/assessments/cbe/batch/route.ts` — POST. Body: `{ subStrandId, items: [{periodId, studentId, level, comment?}] }`. All-or-nothing validation then single `$transaction`. Max 200 items.
  - All three use `(prisma as any)` for new models until `prisma generate` runs.
  - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 4.1–4.5, 3.1–3.8_

- [ ] 8. `CbeJuniorGrid` component — `src/components/assessment/CbeJuniorGrid.tsx`
  - `'use client'`. Props: `classes, defaultClassId?, lockClass?, readOnly?`.
  - On mount: fetch periods (`/api/assessments/periods` filtered to CBE), fetch learning areas (`/api/assessments/cbe/learning-areas`), populate three-level selectors.
  - On selector change: fetch substrand-sheet; populate row state Map (studentId → `{ level, comment, dirty, saving, error }`).
  - Render: period selector, three-level hierarchy selectors, sync badge (from `pendingCount()`), batch bar ("Mark all as" buttons + "Clear all"), student grid, summary footer.
  - Level tap: optimistic update → `enqueue` → flush if online → PUT on success.
  - Comment: inline expand on icon click, saved on blur.
  - Batch "Mark all": confirmation prompt → batch enqueue → POST batch.
  - "Clear all": confirmation prompt → deleteMany via batch with `level: null` for all students.
  - Sync badge: subscribes to `online`/`offline` events; re-runs `pendingCount()` after each flush.
  - _Requirements: 3.1–3.7, 4.1–4.8, 5.1–5.5, 6.1–6.5, 9.1–9.10_

- [ ] 9. `CbePathwayGrid` component — `src/components/assessment/CbePathwayGrid.tsx`
  - `'use client'`. Props: `classes, defaultClassId?, lockClass?, readOnly?`.
  - Fetch pathway weights from `GET /api/assessments/cbe/pathway-weights?classId=…` on load.
  - Reuse `MarksheetGrid` cell input pattern for SBA and Exam columns.
  - Compute "Weighted %" read-only column client-side using `gradingCbe` weighting formula.
  - Save via `POST /api/assessments/marksheet/batch` (numeric items) — no separate endpoint needed.
  - Show `PathwayWeight` labels in column headers; show "(default)" when no configured weight exists.
  - _Requirements: 7.1–7.8_

- [ ] 10. `CbeDashboard` component — `src/components/assessment/CbeDashboard.tsx`
  - `'use client'`. Props: `classes, defaultClassId?`.
  - Fetch from `GET /api/assessments/cbe/dashboard?periodId=&classId=` (implement this endpoint in this task too).
  - Render: stacked bar per sub-strand (EE/ME/AE/BE/NYE counts using pure CSS bars — no external chart lib), learning area summary table, student attainment table.
  - Empty-state message when no entries exist.
  - `GET /api/assessments/cbe/dashboard`: guard `canAccessDashboard`, compute per-sub-strand and per-learning-area aggregates in TypeScript using `gradingCbe.ts`.
  - _Requirements: 12.1–12.4_

- [ ] 11. Framework router — update teacher and principal marksheet pages
  - `src/app/teacher/assessments/marksheet/page.tsx`: after resolving the selected class, read `selectedClass.frameworkType`. If `CBE`, detect sub-type (learningAreas vs competencyUnits), render `CbeJuniorGrid` or `CbePathwayGrid` instead of `MarksheetGrid`.
  - `src/app/principal/assessments/marksheet/page.tsx`: same branch.
  - `src/app/principal/assessments/dashboard/page.tsx`: if selected class is CBE, render `CbeDashboard` instead of `DashboardCharts`.
  - All routing decisions are server-side Prisma reads.
  - _Requirements: 2.1–2.5_

- [ ] 12. Principal pathway weights page — `src/app/principal/assessments/pathway-weights/page.tsx`
  - Server Component shell + client form.
  - List all subjects in the active CBE framework with their current weights (or defaults if not configured).
  - Inline edit for `sbaWeight`, `examWeight`, `sbaMaxMarks`, `examMaxMarks` per subject.
  - Save via `POST /api/assessments/cbe/pathway-weights` (upsert).
  - Add nav item to principal layout: "Pathway Weights" under Examinations group.
  - _Requirements: 8.1–8.5_

- [ ] 13. Add nav items and update classes page
  - `src/app/principal/layout.tsx`: add `{ href: '/principal/assessments/pathway-weights', label: 'Pathway Weights' }` after the existing assessment nav items.
  - `src/app/principal/classes/page.tsx`: add "Curriculum framework" selector to the create-class modal.
  - `src/app/api/classes/route.ts`: GET returns `frameworkType`; POST accepts it.
  - `src/app/principal/students/page.tsx`: show read-only framework label next to class selector.
  - _Requirements: 1.2–1.5_

- [ ] 14. Final compile check — `tsc --noEmit`
  - Run `npx tsc --noEmit` and fix any errors introduced by Stage 2 files.
  - Verify zero new errors in `src/app/api/assessments/cbe/`, `src/lib/assessment/gradingCbe.ts`, `src/lib/assessment/cbeOfflineQueue.ts`, and all updated page files.
  - Confirm `prisma generate` unblocks all `(prisma as any)` casts (document which files need updating post-generate).
  - _Requirements: all_

---

## Notes

- Tasks 1–3 (schema) must be done before Tasks 6–7 (APIs that query new columns/tables).
- Task 4 (`gradingCbe.ts`) and Task 5 (offline queue) have no dependencies and can start immediately.
- Tasks 6–7 depend on Tasks 1 and 4.
- Tasks 8–10 depend on Tasks 5, 6, and 7.
- Tasks 11–13 depend on Tasks 8–10.
- The `(prisma as any)` pattern from Stage 1 applies here too — CBE models will not be in the generated client until `prisma generate` runs successfully.
- The offline queue (Task 5) is pure client-side code and can be developed independently of any API.
- `CbePathwayGrid` (Task 9) reuses the existing `POST /api/assessments/marksheet/batch` endpoint for numeric saves — no new save endpoint needed for that component.
