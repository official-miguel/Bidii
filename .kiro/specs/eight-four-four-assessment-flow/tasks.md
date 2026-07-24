# Implementation Plan: 8-4-4 Assessment Flow

## Overview

Implement the complete 8-4-4 assessment UI and API layer on top of the existing Prisma schema.
Tasks are ordered by dependency: utilities first, then API routes (each depends on the utilities), then components (depend on API shape), then pages (depend on components). Implementation language: TypeScript.

No testing framework tasks are included — this is a production implementation.

---

## Tasks

- [ ] 1. Create grading utility — `src/lib/assessment/grading844.ts`
  - Create the directory `src/lib/assessment/` if it does not exist.
  - Implement `scoreToGrade(percentage: number): GradeResult` using the 12-band KCSE scale from Requirements 1.1 and the `GRADE_BANDS` table in the design.
  - Implement `subjectScore(paperScores: (number | null)[], paperMaxMarks: number[]): number | null` — returns null if any score is null (Requirements 1.2, 1.3, 1.5).
  - Implement `meanGrade(subjectPoints: (number | null)[]): { meanPoints: number; grade: KcseGrade } | null` — excludes nulls, rounds to 2 dp (Requirements 1.6, 2.5).
  - Implement `denseRank(scores: (number | null)[]): (number | null)[]` — dense rank descending, nulls get null rank (Requirements 8.2, 8.5).
  - Export all types: `KcseGrade`, `GradeResult`.
  - No imports from Prisma, next/headers, or any server-only module — this file must be safe to import from client components.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.2, 8.5_

- [ ] 2. Create assessment auth utility — `src/lib/assessment/auth844.ts`
  - Mark file as server-only (`import 'server-only'` at the top, or document that it may only be used in server contexts).
  - Define the `AssessmentActor` interface (user, teacher | null, roles: AssessmentRole[], isPrincipal, adminStaffCanView, adminStaffCanManage).
  - Implement `resolveAssessmentActor(user: User, schoolId: string): Promise<AssessmentActor>`:
    - Fetch the `Teacher` record (where `userId = user.id`) plus all `AssessmentRole` rows for the school's active `EIGHT_FOUR_FOUR` framework in a single Prisma query with `include`.
    - Fetch `StaffRole` permissions for `ADMIN_STAFF` users to populate `adminStaffCanView` / `adminStaffCanManage`.
    - Return the actor object.
  - Implement `canEnterMarks(actor, subjectId)` per the access matrix in the design (Section 2).
  - Implement `canViewMarksheet(actor, subjectId?)` — HOD scoped to their `AssessmentRole.subjectId`.
  - Implement `canAccessDashboard(actor)`.
  - Implement `canGenerateReportCard(actor, classId)` — CLASS_TEACHER check uses `teacher.classTeacherOf` field (the class the teacher is assigned to via `SchoolClass.classTeacherId`).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. API — periods endpoint — `src/app/api/assessments/periods/route.ts`
  - Implement `GET` handler.
  - Authenticate: `getCurrentUser()`; resolve actor; require that user is authenticated (any role). Return 401 if not.
  - Find the school's active `AssessmentFramework` where `type = EIGHT_FOUR_FOUR` and `isActive = true`. Return 404 if none exists.
  - Query `AssessmentPeriod` where `frameworkId = framework.id`, ordered `term ASC, name ASC`.
  - Return the period list shape from the design (Section 3.1).
  - _Requirements: 7.1, 7.5_

- [ ] 4. API — marksheet GET endpoint — `src/app/api/assessments/marksheet/route.ts`
  - Implement `GET` handler with query params `periodId`, `classId`, `subjectId`.
  - Validate all three params are present; return 400 if missing.
  - Resolve actor; call `canViewMarksheet(actor, subjectId)`; return 403 if false.
  - Fetch `Paper` rows for `(frameworkId, subjectId)` ordered by `sortOrder ASC`.
  - Fetch all `Student` rows in the class ordered by `admissionNumber ASC`.
  - Fetch all `AssessmentItem` rows where `periodId = periodId AND paperId IN paperIds AND studentId IN studentIds`.
  - Build the `rows` array: for each student, build `scores: Record<paperId, number | null>` — present row → its `numericScore` (may be 0); absent row → `null`.
  - Return response shape from the design (Section 3.2).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 2.1, 2.2, 2.3_

- [ ] 5. API — marksheet item PUT endpoint — `src/app/api/assessments/marksheet/item/route.ts`
  - Implement `PUT` handler.
  - Parse and validate request body: `{ periodId, studentId, subjectId, paperId, score: number | null }`.
  - Resolve actor; call `canEnterMarks(actor, subjectId)`; return 403 if false.
  - Server-side validation: fetch `Paper` to get `maxMarks`; if `score !== null`, enforce `0 ≤ score ≤ maxMarks`; return 400 with `{ error, code: "VALIDATION_ERROR" }` on failure.
  - Verify `studentId` belongs to `user.schoolId` (fetch student and check `schoolId`).
  - If `score === null`: `prisma.assessmentItem.deleteMany({ where: { studentId, periodId, paperId } })`.
  - If `score` is a number: `prisma.assessmentItem.upsert` on the `item_paper` unique constraint (`studentId + periodId + paperId`). Set `resultKind = NUMERIC`, `numericScore = score`, `frameworkId`, `schoolId`, `enteredById = teacher.id`.
  - Return `{ ok: true }` on success.
  - _Requirements: 2.1, 2.2, 2.6, 5.1, 5.2, 5.4, 5.5, 3.1, 3.6_

- [ ] 6. API — marksheet batch POST endpoint — `src/app/api/assessments/marksheet/batch/route.ts`
  - Implement `POST` handler.
  - Parse body: `{ subjectId, items: Array<{ periodId, studentId, paperId, score: number | null }> }`.
  - Resolve actor; call `canEnterMarks(actor, subjectId)`; return 403 if false.
  - Fetch all relevant `Paper` rows (for maxMarks) and all `studentId`s to validate ownership in bulk.
  - Validate every item: `score` in range, studentId in school, paperId belongs to subjectId+frameworkId. Collect errors with item `index`.
  - If any validation errors: return 400 `{ error: "VALIDATION_ERROR", items: [...] }`. Write nothing.
  - If all valid: run a Prisma `$transaction` with upsert/delete for each item.
  - Return `{ ok: true, count: N }`.
  - _Requirements: 6.3, 6.4, 6.5, 6.6, 3.1, 3.6_

- [ ] 7. API — dashboard endpoint — `src/app/api/assessments/dashboard/route.ts`
  - Implement `GET` handler with query params: `periodId` (required), `classId?`, `subjectId?`, `form?`.
  - Resolve actor; call `canAccessDashboard(actor)`; return 403 if false.
  - Fetch the relevant `AssessmentPeriod`, all matching `Student` rows (scoped by classId/form if provided), their `AssessmentItem` rows for the period, and `Paper` rows.
  - Compute all metrics in TypeScript using `grading844.ts` functions (no computed SQL):
    - `subjectPerformance`: group items by subjectId; for each subject, compute `subjectScore` per student, then average non-null values.
    - `gradeDistribution`: for each student compute mean grade; count by grade letter.
    - `classComparison`: group students by classId; compute per-class stats.
    - `trendData`: fetch ALL `AssessmentPeriod` rows for the framework, same class scope; compute mean grade per period.
    - `subjectClassHeatmap`: build the 2D grid of mean scores per (subject, class).
  - When no students have entered marks, return all metrics as `null`/empty.
  - Return response shape from design (Section 3.5).
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 8. API — report card endpoints
  - [ ] 8.1 Single student — `src/app/api/assessments/report-card/route.ts`
    - Implement `GET` handler with query params `periodId`, `studentId`.
    - Resolve actor; call `canGenerateReportCard(actor, student.classId)`; return 403 if false.
    - Fetch student, class, period, papers, and all `AssessmentItem` rows for this student + period.
    - Compute `subjectScore`, `grade`, `points` per subject using `grading844.ts`.
    - Compute `position`: fetch all students in the same class + period; compute `denseRank` over total points.
    - Return response shape from design (Section 3.6).
    - _Requirements: 3.4, 8.1, 8.2, 8.3, 8.4_
  - [ ] 8.2 Class-wide — `src/app/api/assessments/report-card/class/route.ts`
    - Implement `GET` handler with query params `periodId`, `classId`.
    - Resolve actor; call `canGenerateReportCard(actor, classId)`; return 403 if false.
    - Fetch all students in the class; run the same computation as single-student for each.
    - Compute `denseRank` across all students in one pass.
    - Order students: ranked first (by position ASC), unranked (null position) at end ordered by `admissionNumber ASC`.
    - Return response shape from design (Section 3.7).
    - _Requirements: 3.4, 8.1, 8.2, 8.3, 8.4_

- [ ] 9. MarksheetGrid component — `src/components/assessment/MarksheetGrid.tsx`
  - Mark as `'use client'`.
  - Define `MarksheetGridProps` (data shape from API, `canEdit: boolean`).
  - Implement cell state management keyed by `${studentId}:${paperId}` with statuses: idle / editing / saving / error (see design Section 4).
  - Render the `<table>` with sticky first two columns (`position: sticky; left: 0; z-10; bg-white`), paper columns, and computed read-only columns (Score %, Grade, Pts).
  - Compute Subject_Score, Grade, Pts in real time from cell state using `grading844.ts` imports.
  - Implement `<tfoot>` summary row computing class means from current cell values.
  - Apply grade colour-coding per the design colour map (Section 4).
  - Implement `onBlur` / Tab / Enter / Arrow key navigation (Requirements 5.8, 5.9, 5.10).
  - Implement auto-save on blur: call `PUT /api/assessments/marksheet/item`, show spinner, handle error state (Requirements 5.4, 5.5, 5.6, 5.7).
  - Implement inline validation (reject > maxMarks, reject non-numeric) on input (Requirements 5.1, 5.2, 5.3).
  - Implement `onPaste` handler: parse clipboard, validate, call `POST /api/assessments/marksheet/batch`, show truncation warning toast (Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6).
  - Show "—" for Not_Entered in Grade/Score/Pts columns (Requirement 2.7).
  - _Requirements: 4.1–4.8, 5.1–5.10, 6.1–6.6, 2.3, 2.7_

- [ ] 10. Dashboard page and charts
  - [ ] 10.1 DashboardCharts component — `src/components/assessment/DashboardCharts.tsx`
    - Mark as `'use client'`.
    - Implement five sub-components using Recharts: `SubjectPerformanceBar`, `GradeDistributionBar`, `ClassComparisonTable`, `TrendLineChart`, `SubjectClassHeatmap` (see design Section 5).
    - Each sub-component renders its own empty-state message when its data array is empty (Requirement 9.8).
    - Use grade-band colours from `grading844.ts` for bar fills and heatmap cells.
    - Wrap all charts in `<ResponsiveContainer width="100%" height={300}>`.
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_
  - [ ] 10.2 Principal dashboard page — `src/app/principal/assessments/dashboard/page.tsx`
    - Server Component: authenticate, resolve actor, check `canAccessDashboard`.
    - Render filter controls (period, class, subject, form) as URL-param-driven selectors using `useSearchParams` in a child client component.
    - Fetch dashboard data server-side for the default selection (current period, all classes).
    - Pass data to `DashboardCharts`.
    - _Requirements: 9.1, 9.8_

- [ ] 11. Report card component and print page
  - [ ] 11.1 ReportCard component — `src/components/assessment/ReportCard.tsx`
    - Pure display component (no state, no API calls).
    - Render all sections described in the design (Section 6): school name, heading, student info, subject table, summary.
    - Show "—" for Not_Entered paper scores (Requirement 2.7).
    - Add `className="report-card-page"` wrapper div.
    - Include `@media print` styles (or a separate `globals.css` addition): `.no-print { display: none !important }`, `.report-card-page { page-break-after: always }`.
    - _Requirements: 2.7, 8.1, 8.2, 8.3, 8.4_
  - [ ] 11.2 Print route — `src/app/assessments/report-card/print/page.tsx`
    - No `layout.tsx` in this directory (ensure the print page renders without the app shell).
    - Server Component: call `getCurrentUser()`, resolve actor.
    - Accept query params: `periodId + studentId` (single) or `periodId + classId` (class-wide). Call the appropriate report-card service function directly (no HTTP round-trip) after checking `canGenerateReportCard`.
    - Render one `<ReportCard>` per student wrapped in `.report-card-page`.
    - Render existing `<PrintBar>` component with `className="no-print"`.
    - _Requirements: 3.4_

- [ ] 12. Principal assessment pages and nav
  - [ ] 12.1 Layout and redirect — `src/app/principal/assessments/layout.tsx` + `page.tsx`
    - Create thin `layout.tsx` that just renders `{children}` (outer principal layout handles sidebar + auth).
    - Create `page.tsx` that redirects to `/principal/assessments/periods`.
  - [ ] 12.2 Periods page — `src/app/principal/assessments/periods/page.tsx`
    - Server Component: fetch all periods via the `/api/assessments/periods` logic (direct service call).
    - Render a `SectionCard` listing all periods with name, term, academic year, `isCurrent` badge.
    - Each period links to `/principal/assessments/marksheet?periodId=...`.
    - Show informational message if no current period exists (Requirement 7.5).
    - _Requirements: 7.1, 7.5_
  - [ ] 12.3 Marksheet page — `src/app/principal/assessments/marksheet/page.tsx`
    - Server Component shell with URL-param selectors (period, class, subject) in a client child component.
    - When all three are selected, fetch marksheet data and pass to `MarksheetGrid` with `canEdit={true}`.
    - Subject selector filters by `Subject.applicableForms` matching the selected class's `form` (Requirement 7.3).
    - Show access-denied message if principal tries a subject that has no data (edge case) (Requirement 7.4).
    - Show "Select period, class, and subject to view the marksheet" when selectors are incomplete.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ] 12.4 Report cards page — `src/app/principal/assessments/report-cards/page.tsx`
    - Period + class selectors; list all students in the class with a "Print" link per student pointing to `/assessments/report-card/print?periodId=...&studentId=...`.
    - "Print All" button linking to `/assessments/report-card/print?periodId=...&classId=...`.
    - _Requirements: 3.4_
  - [ ] 12.5 Add nav items to principal sidebar — `src/app/principal/layout.tsx`
    - Add the four Examinations nav items to the `NAV` array (see design Section 8.3).
    - Insert them after the existing "Results" entry.
    - _Requirements: (navigation change)_

- [ ] 13. Teacher assessment pages and nav
  - [ ] 13.1 Teacher assessments layout — `src/app/teacher/assessments/layout.tsx`
    - Thin layout that renders `{children}`; outer teacher layout handles sidebar/auth.
  - [ ] 13.2 Teacher marksheet page — `src/app/teacher/assessments/marksheet/page.tsx`
    - Same structure as principal marksheet page.
    - Resolve actor using `resolveAssessmentActor`; subject selector only shows subjects the teacher `canEnterMarks` for (Requirement 7.3).
    - Pass `canEdit={canEnterMarks(actor, subjectId)}` to `MarksheetGrid` (read-only if HOD viewing, editable if subject teacher).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 3.1, 3.2_
  - [ ] 13.3 Teacher report cards page — `src/app/teacher/assessments/report-cards/page.tsx`
    - If `canGenerateReportCard` is true for any class, show period + class selector and student list with print links.
    - If teacher is a class teacher, show "Print All" for their class.
    - _Requirements: 3.4_
  - [ ] 13.4 Add nav items to teacher sidebar — `src/app/teacher/layout.tsx`
    - Add "Marksheet" and "Report Cards" links to the teacher nav array (see design Section 8.3).
    - Always visible (not gated on `classTeacherOf`).
    - _Requirements: (navigation change)_

- [ ] 14. Final checkpoint
  - Ensure all TypeScript compiles without errors (`tsc --noEmit`).
  - Verify all API routes have correct `schoolId` scoping (no cross-school data leaks).
  - Verify the print page renders without the sidebar/nav wrapper.
  - Verify `MarksheetGrid` handles an empty class (no students) gracefully.
  - Verify the dashboard returns empty-state JSON (not null pointer errors) when no marks are entered for a period.
  - Ask the user if any questions arise before marking complete.

---

## Notes

- Tasks 1 and 2 have no dependencies and can be started immediately.
- Tasks 3–8 depend on Tasks 1 and 2.
- Task 9 depends on Tasks 4, 5, and 6 (needs the API shape).
- Tasks 10–11 depend on Task 9 for component contracts and Tasks 7–8 for API shapes.
- Tasks 12–13 depend on Tasks 9–11 (consume all components).
- The print page (Task 11.2) works independently of principal/teacher pages but depends on Task 11.1.
- All grading computation happens in `grading844.ts` — never duplicated in components or API routes.
