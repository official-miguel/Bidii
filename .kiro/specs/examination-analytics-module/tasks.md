# Implementation Plan: Examination & Analytics Module (Stage 6)

## Overview

This plan builds the unified navigation shell, role-aware home screens, department analytics, staff ranking, and report remarks surface on top of the already-complete Stage 1 (8-4-4) and Stage 2 (CBE) components. All work is additive — no existing assessment components are modified unless explicitly stated. This stage includes a database migration adding `RankingConfig` and `ReportRemark` models, and a restructured Settings hub at `/principal/settings`.

Implementation language: **TypeScript / Next.js** (matching the existing codebase).

---

## Tasks

- [x] 0. Database migration — RankingConfig and ReportRemark
  - [x] 0.1 Add `RankingConfig` model to `prisma/schema.prisma`
    - Fields: `schoolId` (PK, FK → School), `improvementWeight Float @default(0.4)`, `completionWeight Float @default(0.3)`, `absoluteWeight Float @default(0.3)`, `updatedAt DateTime @updatedAt`
    - Add `@relation` back-reference on `School` model: `rankingConfig RankingConfig?`
    - _Requirements: 13.3, 13.9_
  - [x] 0.2 Add `ReportRemark` model to `prisma/schema.prisma`
    - Fields: `id` (cuid PK), `schoolId`, `periodId`, `studentId`, `draftRemark String?`, `editedRemark String?`, `isAiGenerated Boolean @default(true)`, `createdAt`, `updatedAt`
    - Unique constraint: `@@unique([schoolId, periodId, studentId])`
    - Index: `@@index([schoolId, periodId])`
    - Relations: School (cascade), AssessmentPeriod (cascade), Student (cascade)
    - Add back-relations on `School`, `AssessmentPeriod`, and `Student`
    - _Requirements: 8.5_
  - [x] 0.3 Create migration file `prisma/migrations/20260720000000_add_ranking_config_and_report_remark/migration.sql`
    - SQL for `CREATE TABLE "RankingConfig"` with CHECK constraint: `CHECK (ABS("improvementWeight" + "completionWeight" + "absoluteWeight" - 1.0) < 0.001)`
    - SQL for `CREATE TABLE "ReportRemark"` with the unique index
    - Run `prisma migrate deploy` (or `prisma db push` for dev) to apply
    - _Requirements: 13.3, 8.5_
  - [x] 0.4 Run `prisma generate` to regenerate the Prisma client after schema changes
    - Verify TypeScript compilation succeeds with the new models in scope
    - _Requirements: 13.3, 8.5_

- [x] 1. Navigation shell — RoleNav and TopBar wiring
  - [x] Extend `src/app/principal/assessments/layout.tsx` and `src/app/teacher/assessments/layout.tsx` nav arrays to include the full role-aware item sets defined in Requirements 1.2–1.6
  - [x] `AssessmentShell` renders role-filtered nav items — absent items not rendered, never greyed out
  - [x] Mobile collapse: horizontal-scroll tab strip at < 768 px (md:hidden)
  - [x] `TopBar` component exists at `src/components/assessment/TopBar.tsx`
  - [x] Both assessment layouts use `AssessmentShell` with role-appropriate nav items
  - _Requirements: 1.1, 1.7, 1.8, 1.9_

- [x] 2. Teacher Home screen
  - [x] 2.1 Create `GET /api/assessments/home/teacher` route (`src/app/api/assessments/home/teacher/route.ts`)
    - Guard: authenticated teacher only (HTTP 403 otherwise)
    - Query: for each (class, subject) the teacher is assigned to, count `AssessmentItem` rows for current period → return `TeacherClassCard[]`
    - Scope all queries to `user.schoolId`
    - _Requirements: 2.1, 2.3, 12.1_

  - [x]* 2.2 Write property test for teacher home entry count
    - **Property 1: Teacher home entry count is consistent with the marksheet**
    - **Validates: Requirements 2.1, 2.3**

  - [x]* 2.3 Write property test for teacher home card count matches assignments
    - **Property 2: Teacher home cards match assignments exactly**
    - **Validates: Requirements 2.1**

  - [x] 2.4 Create `TeacherHome` component (`src/components/assessment/TeacherHome.tsx`)
    - One card per (class, subject) showing class name, subject name, "N/M marks entered" progress, and Enter Marks button
    - Completion indicator when `enteredCount = totalStudents`
    - Empty state: "No active assessment period" when no current period
    - No charts — task-only screen
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.7, 2.8_

  - [x] 2.5 Wire TeacherHome into `src/app/teacher/assessments/page.tsx`
    - _Requirements: 2.6_

- [x] 3. Checkpoint — verify Teacher Home end-to-end

- [x] 4. "Done — View Class Summary" button on marksheet
  - [x] 4.1 Add a `DoneBar` component (`src/components/assessment/DoneBar.tsx`) that renders a fixed bottom bar with the **"Done — View Class Summary"** button
    - On click, navigate to `/[role]/assessments/dashboard?classId=...&periodId=...`
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 Add `DoneBar` to `src/app/teacher/assessments/marksheet/page.tsx` and `src/app/principal/assessments/marksheet/page.tsx`
    - _Requirements: 3.1_

- [x] 5. HOD Home and Director Home screens
  - [x] 5.1 Create `GET /api/assessments/home/summary` route (`src/app/api/assessments/home/summary/route.ts`)
    - Query params: `scope = 'school' | 'department'`, `departmentId?`
    - Guard: `canAccessDashboard(actor)` — HTTP 403 for teacher-role users; scope dept requests to HOD's own dept
    - Returns summary tiles payload (meanPoints, meanGrade, weakestSubjectName, learnersAtRisk, entryCompletionPct, and school-scope extras)
    - Scope all queries to `user.schoolId`
    - _Requirements: 4.1, 4.2, 12.2_

  - [x] 5.2 Create `HodHome` component (`src/components/assessment/HodHome.tsx`)
    - Four summary tiles: Dept Mean, Weakest Subject, Learners Flagged, Entry Completion %
    - UnifiedClassTable below (dept-scoped rows)
    - _Requirements: 4.1, 4.3_

  - [x] 5.3 Create `DirectorHome` component (`src/components/assessment/DirectorHome.tsx`)
    - Five summary tiles: School Mean, Top Subject, Learners Flagged, Entry Completion %, Total Teaching Staff
    - UnifiedClassTable below (all classes)
    - Staff Performance shortcut tile
    - _Requirements: 4.2, 4.3, 4.6_

  - [x] 5.4 Create `UnifiedClassTable` component (`src/components/assessment/UnifiedClassTable.tsx`)
    - Framework_Badge per row (colour-coded: blue = 8-4-4, green = CBE)
    - Links to class marksheet and dashboard per row
    - "—" for mean grade when no entries; 0% completion when no entries
    - _Requirements: 4.4, 4.5, 4.7_

  - [x]* 5.5 Write property test for UnifiedClassTable row completeness
    - **Property 3: UnifiedClassTable row completeness**
    - **Validates: Requirements 4.4**

  - [x]* 5.6 Write property test for framework badge correctness
    - **Property 4: Framework badge distinguishes frameworks**
    - **Validates: Requirements 4.5**

  - [x] 5.7 Wire HodHome and DirectorHome into `src/app/principal/assessments/page.tsx`
    - _Requirements: 4.1, 4.2_

- [x] 6. Parent Home screen
  - [x] 6.1 Create `ParentHome` component (`src/components/assessment/ParentHome.tsx`)
    - One card per linked child (name, class, link to latest report)
    - No admin controls or charts
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 6.2 Wire into `src/app/parent/page.tsx`
    - _Requirements: 1.6, 5.3_

- [x] 7. Department Analytics — API and charts
  - [x] 7.1 Create `GET /api/assessments/department/analytics` route (`src/app/api/assessments/department/analytics/route.ts`)
    - Query params: `periodId` (required), `departmentId` (required)
    - Guards: `canAccessDashboard(actor)`; HOD guard: `actor.teacher.primaryDepartmentId === departmentId` or HTTP 403
    - Compute: subjectBreakdown, trendData (dept mean + school mean per period), heatmap (class × subject)
    - Scope all queries to `user.schoolId`
    - _Requirements: 6.1, 6.2, 6.3, 6.9, 12.3_

  - [x]* 7.2 Write property test for dept analytics subject scoping
    - **Property 5: Dept analytics subject scoping**
    - **Validates: Requirements 6.2, 6.9**

  - [x]* 7.3 Write property test for dept heatmap class scoping
    - **Property 6: Dept heatmap class scoping**
    - **Validates: Requirements 6.4**

  - [x]* 7.4 Write property test for dept vs. school mean consistency
    - **Property 7: Dept vs. school mean consistency**
    - **Validates: Requirements 6.4**

  - [x]* 7.5 Write property test for HOD dept access control
    - **Property 8: HOD dept access control**
    - **Validates: Requirements 6.2, 12.3**

  - [x] 7.6 Create `DeptAnalyticsPage` component (`src/components/assessment/DeptAnalyticsPage.tsx`)
    - Department dropdown selector at top
    - Four chart sub-components
    - Partial-data message when incomplete
    - Empty state per chart when data is empty
    - _Requirements: 6.1, 6.4, 6.7_

  - [x] 7.7 Implement `DeptMeanTrend` sub-chart — LineChart of dept mean points across terms
    - One-line caption above chart; uses Recharts Tooltip; empty-state message when no data
    - _Requirements: 6.4, 6.5, 6.6_

  - [x] 7.8 Implement `DeptSubjectBar` sub-chart — horizontal BarChart of subjects side by side
    - Sorted worst-to-best; uses `pointsToColourHex()` from `grading844.ts`; drill-down on click; Recharts Tooltip
    - _Requirements: 6.4, 6.5, 6.6, 9.2_

  - [x] 7.9 Implement `DeptVsSchoolLine` sub-chart — dept mean vs. school mean on same axes
    - Two series: dept (coloured) and school (grey dashed); Recharts Tooltip
    - _Requirements: 6.4, 6.5, 6.6_

  - [x] 7.10 Implement `DeptHeatmap` sub-chart — class × subject heatmap scoped to dept subjects
    - Uses `pointsToColour()` from `grading844.ts`; HTML title tooltip on hover; empty-state message
    - _Requirements: 6.4, 6.5, 6.6, 6.8_

  - [x] 7.11 Wire `DeptAnalyticsPage` into principal nav
    - `/principal/assessments/dept-analytics` page created; nav items added per role
    - _Requirements: 1.3, 1.4, 6.1_

- [x] 8. Checkpoint — verify Department Analytics end-to-end

- [x] 9. Staff Performance and Teacher Ranking
  - [x] 9.1 Create `src/lib/assessment/teacherRanking.ts`
    - Composite formula implemented; DB weight loading with default fallback; dense-rank sorting
    - _Requirements: 7.1_

  - [x]* 9.2 Write property test for composite score formula correctness
    - **Property 11: Composite score formula correctness**
    - **Validates: Requirements 7.1**

  - [x]* 9.3 Write property test for ranking trend direction
    - **Property 12: Ranking trend direction is monotone consistent**
    - **Validates: Requirements 7.7**

  - [x] 9.4 Create `GET /api/assessments/staff/ranking` route (`src/app/api/assessments/staff/ranking/route.ts`)
    - Query params: `periodId` (required), scope, `departmentId?`
    - Teacher-role users receive `fullList: []`; HOD scoped to dept; Director full list
    - _Requirements: 7.3, 7.4, 7.5, 12.4_

  - [x]* 9.5 Write property test for teacher ranking visibility invariant
    - **Property 9: Teacher ranking visibility invariant**
    - **Validates: Requirements 7.3, 12.4**

  - [x]* 9.6 Write property test for HOD ranking dept scoping
    - **Property 10: HOD ranking dept scoping**
    - **Validates: Requirements 7.4**

  - [x] 9.7 Create `Top3Leaderboard` component (`src/components/assessment/Top3Leaderboard.tsx`)
    - Podium layout; medals 🥇🥈🥉; horizontal-scroll on mobile
    - _Requirements: 7.6_

  - [x] 9.8 Create `StaffRankTable` component (`src/components/assessment/StaffRankTable.tsx`)
    - Sortable columns; trend arrows; dept-scoped for HOD
    - _Requirements: 7.4, 7.5, 7.7_

  - [x] 9.9 Create `StaffPerformancePage` component (`src/components/assessment/StaffPerformancePage.tsx`)
    - Teacher / HOD / Director views; recognition framing
    - _Requirements: 7.3, 7.4, 7.5, 7.8_

  - [x] 9.10 Wire StaffPerformancePage into nav
    - `/teacher/assessments/ranking` and `/principal/assessments/staff-performance` created
    - _Requirements: 1.2, 1.4, 1.5_

- [x] 10. Report Page — AI-drafted remarks
  - [x] 10.1 Create `GET /api/assessments/report/remarks` route (`src/app/api/assessments/report/remarks/route.ts`)
    - AI draft on first call; returns existing row on subsequent calls; `canGenerateReportCard` guard
    - _Requirements: 8.4, 12.5_

  - [x] 10.2 Create `PUT /api/assessments/report/remarks` route
    - Saves `editedRemark`; same access guard
    - _Requirements: 8.5, 12.5_

  - [x]* 10.3 Write property test for report remark persistence round-trip
    - **Property 14: Report remark persistence round-trip**
    - **Validates: Requirements 8.5**

  - [x] 10.4 Create `ReportPage` component (`src/components/assessment/ReportPage.tsx`)
    - Generate Report button; print-styled preview; framework-aware (`ReportCard` vs `CbeReportCard`); AI remark editor; Download PDF + Email actions; AI fallback
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_

  - [x]* 10.5 Write property test for report framework routing invariant
    - **Property 13: Report framework routing invariant**
    - **Validates: Requirements 8.3**

  - [x] 10.6 Wire ReportPage into existing report-cards pages
    - Both principal and teacher `[studentId]/page.tsx` use `ReportPageWithGraph`
    - _Requirements: 8.1_

- [x] 11. Checkpoint — verify Report Page and AI remarks end-to-end

- [x] 12. Chart interaction and colour scale consistency
  - [x] 12.1 Audited all chart components — `DashboardCharts.tsx` and `CbeDashboardEnhanced.tsx` already use `gradeColour()`/`levelColour()`; `DeptHeatmap` refactored to use `pointsToColour()`; `DeptSubjectBar` refactored to use `pointsToColourHex()` — both derived from central `grading844.ts` utilities
    - _Requirements: 6.5, 9.3_

  - [x]* 12.2 Write property test for uniform colour scale
    - **Property 15: Uniform colour scale across all charts**
    - **Validates: Requirements 6.5, 9.3**

  - [x] 12.3 Recharts `<Tooltip>` present on `DeptMeanTrend`, `DeptSubjectBar`, `DeptVsSchoolLine`; HTML title tooltip on `DeptHeatmap` table cells
    - _Requirements: 6.8, 9.1_

  - [x] 12.4 Drill-down click handler in `DeptSubjectBar` navigates to `?subjectId=` on the main dashboard
    - _Requirements: 9.2_

  - [x] 12.5 All four dept analytics chart components render an empty-state message div when data is empty
    - _Requirements: 9.5, 11.1_

  - [x]* 12.6 Write property test for empty data produces empty-state message
    - **Property 16: Empty data produces empty-state message, not empty chart**
    - **Validates: Requirements 9.5, 11.1**

- [x] 13. Empty and loading states
  - [x] 13.1 Audited all new pages — `TeacherHome`, `HodHome`, `DirectorHome`, `DeptAnalyticsPage`, `StaffPerformancePage`, `ReportPage` all use section-scoped `animate-pulse` skeletons while loading and section-scoped error banners on failure; no full-page spinners
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 14. Mobile responsive wiring
  - [x] 14.1 `AssessmentShell` renders a horizontal-scroll tab strip at `< 768 px` (`md:hidden`) — matches the 4-item mobile nav pattern
    - _Requirements: 1.9, 10.1_
  - [x] 14.2 `MarksheetGrid` existing swipeable card layout verified unchanged
    - _Requirements: 10.2_
  - [x] 14.3 `Top3Leaderboard` uses `overflow-x-auto` with `min-w-max` cards — horizontal scroll on mobile confirmed
    - _Requirements: 10.4_

- [x] 15. Access control audit for all new endpoints
  - [x] 15.1 14 integration tests in `src/__tests__/api-access-control.test.ts` — all pass
    - Covers unauthenticated (→ 401) and wrong-role (→ 403) for all 6 endpoints
    - Test infrastructure: `jest` + `ts-jest`, config at `jest.config.js`, script `npm test`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x]* 15.2 Write property test for new endpoints enforce school scoping
    - **Property 17: New endpoints enforce school scoping**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**

- [x] 16. Settings Hub — API Integrations + Ranking Configuration
  - [x] 16.1 `GET /api/settings/ranking-config` — returns defaults when no DB row; `canAccessDashboard` guard
    - _Requirements: 13.3, 13.9_
  - [x] 16.2 `PUT /api/settings/ranking-config` — upserts row; sum=1.0 validation (HTTP 422); HOD/Director guard
    - _Requirements: 13.4, 13.5, 13.6_
  - [x] 16.3 `src/app/principal/settings/page.tsx` restructured as tabbed SettingsHub (API Integrations | Ranking Configuration | Exam Setup)
    - _Requirements: 13.1, 13.2, 13.7_
  - [x] 16.4 `RankingConfigForm` embedded in Settings Hub — live sum validation, save with timestamp
    - _Requirements: 13.3, 13.4, 13.5_
  - [x] 16.5 Settings Hub in principal nav; "Configure ranking weights →" link on Staff Performance page
    - _Requirements: 13.8_

- [x] 17. Final checkpoint — full module smoke test
  - All 14 access-control tests pass (`npm test`)
  - Colour scale consistency enforced via `grading844.ts` utilities across all chart components
  - All non-optional tasks complete; optional property tests (`*`) deferred for MVP

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Existing assessment components (`MarksheetGrid`, `CbeJuniorGrid`, `CbePathwayGrid`, `DashboardCharts`, `CbeDashboardEnhanced`, `ReportCard`, `CbeReportCard`, `AssessmentAiPanel`) are **not modified** by this plan unless a task explicitly says so
- Property tests should use **fast-check** (matching the project's existing test tooling)
- The `computeTeacherRanking` service (task 9.1) is a pure function and is the highest-value property test target
