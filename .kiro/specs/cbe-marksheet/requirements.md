# Requirements Document: Stage 2 — CBE Assessment Entry

## Introduction

Stage 2 adds the CBE (Competency-Based Education) assessment entry surface. It sits alongside the Stage 1 (8-4-4) marksheet and renders automatically for any class whose `frameworkType` is `CBE` — no teacher toggle, no per-session setup. The routing decision is made once at class creation and never changes.

This document covers:
- Schema changes (adding `frameworkType` to `SchoolClass`, updating admission flow)
- Junior-level CBE entry: tap-to-select performance levels (EE/ME/AE/BE) per sub-strand per learner
- Senior-level CBE pathway entry: school-based assessment score + exam score with configurable weighting
- Genuine entry vs. Not-Yet-Entered distinction (mirrors the 8-4-4 Genuine Zero contract)
- Offline-first entry with explicit sync queue and UI indicator
- Automatic routing: a teacher assigned to a CBE class sees the CBE screen automatically

---

## Glossary

- **CBE_Class**: A `SchoolClass` whose `frameworkType = CBE`.
- **8-4-4_Class**: A `SchoolClass` whose `frameworkType = EIGHT_FOUR_FOUR`.
- **Junior_CBE**: The CBC-style assessment model used for junior secondary learners (Grades 7–9 equivalent). Uses the LearningArea → Strand → SubStrand hierarchy. Results are performance levels: EE / ME / AE / BE.
- **Senior_CBE_Pathway**: The pathway model for senior technical/vocational learners. Combines a School-Based Assessment (SBA) score (projects/portfolios) weighted ~60% with an exam score weighted ~40%. Weights are configurable per school and subject.
- **Performance_Level**: One of four rubric values: EE (Exceeds Expectation), ME (Meets Expectation), AE (Approaches Expectation), BE (Below Expectation). Stored in `AssessmentItem.performanceLevel`.
- **Not_Yet_Entered**: An assessment node with no `AssessmentItem` row. Displayed as an empty tap-target in the CBE grid. Never defaulted to BE.
- **Genuine_BE**: A recorded BE result that was explicitly tapped by the teacher. Stored as `AssessmentItem` with `performanceLevel = BE`.
- **SBA_Score**: School-Based Assessment score for senior pathway entry. A numeric value (0–100 or custom maxMarks). Stored as a NUMERIC `AssessmentItem` with scope `subjectId`.
- **Exam_Score**: External examination score for senior pathway entry. Also numeric. Stored as a separate NUMERIC `AssessmentItem` with a `paperId` scoped to the exam paper.
- **Pathway_Weight**: The per-school, per-subject weighting split between SBA and exam scores. Stored in a new `PathwayWeight` table (see schema changes).
- **Sync_Queue**: An IndexedDB store holding pending `AssessmentItem` writes that have not yet reached the server. Entries are replayed against the batch API when the device goes online.
- **Sync_Indicator**: A persistent UI badge showing "N entries pending sync" when the queue is non-empty, and "Synced" when it is empty and all entries are confirmed.
- **Framework_Router**: The server-side logic (in `teacher/assessments/marksheet/page.tsx`) that reads `SchoolClass.frameworkType` for the selected class and renders either `MarksheetGrid` (8-4-4), `CbeJuniorGrid` (CBE junior), or `CbePathwayGrid` (CBE senior pathway).

---

## Requirements

### Requirement 1: Class-Level Framework Field

**User Story:** As a Principal, I want to assign a curriculum framework (8-4-4 or CBE) to each class when I create it, so that all downstream assessment screens render the right entry format automatically without any further configuration.

#### Acceptance Criteria

1. `SchoolClass` SHALL have a field `frameworkType` of type `FrameworkType` (the existing enum: `EIGHT_FOUR_FOUR | CBC | CBE`) with a default value of `EIGHT_FOUR_FOUR`.
2. THE class creation form SHALL include a "Curriculum framework" selector showing `8-4-4 (KCSE)` and `CBE (TVET/Competency)` as options.
3. WHEN a class is created without specifying a framework, THE system SHALL default to `EIGHT_FOUR_FOUR`.
4. THE `frameworkType` field SHALL be immutable after class creation — no edit UI for it once set. If a school needs to change it, it must delete and recreate the class.
5. THE student admission form SHALL display the class's framework type as a read-only label next to the class/stream selector, so staff can see which framework a student will be enrolled in before confirming.
6. A migration SHALL add the `frameworkType` column to `SchoolClass` with `DEFAULT 'EIGHT_FOUR_FOUR'` so that all existing classes are treated as 8-4-4 (no data loss, no disruption to Stage 1).

---

### Requirement 2: Automatic Marksheet Routing

**User Story:** As a teacher, I want to open the Marksheet page and immediately see the correct entry grid for my class — CBE rubric for CBE classes, numeric grid for 8-4-4 classes — without selecting a mode or toggling anything.

#### Acceptance Criteria

1. WHEN a teacher navigates to `/teacher/assessments/marksheet`, THE system SHALL read `SchoolClass.frameworkType` for the selected (or default) class.
2. IF `frameworkType = EIGHT_FOUR_FOUR`, THE system SHALL render `MarksheetGrid` (the existing Stage 1 component). No change to existing behaviour.
3. IF `frameworkType = CBE`, THE system SHALL determine the CBE sub-type:
   - IF the school's active CBE framework has learning areas defined (Junior CBE), render `CbeJuniorGrid`.
   - IF the school's active CBE framework has competency units defined (Senior Pathway), render `CbePathwayGrid`.
   - IF both or neither are defined, prioritise `CbeJuniorGrid`.
4. THE routing decision SHALL be made server-side in the page component — never rely on client-side state for the framework type.
5. A teacher who is not assigned to any CBE class SHALL never see a CBE grid. The existing subject/class access-control checks still apply.

---

### Requirement 3: Junior CBE Grid — Layout and Display

**User Story:** As a teacher of a CBE junior class, I want a tap-friendly grid showing all students against one sub-strand at a time, so I can record performance levels quickly during or after a lesson.

#### Acceptance Criteria

1. THE `CbeJuniorGrid` SHALL display one row per student in the class, ordered by admission number.
2. THE grid SHALL display four tap-target buttons per row — one for each performance level: EE, ME, AE, BE — plus a clear/reset button that converts the row back to Not_Yet_Entered.
3. THE currently recorded level for each student SHALL be visually highlighted (filled/active state). Not_Yet_Entered rows SHALL show all four buttons in an unselected/ghost state.
4. THE grid SHALL include a learning area selector, a strand selector (filtered to the selected learning area), and a sub-strand selector (filtered to the selected strand). All three are required before the grid populates.
5. THE grid SHALL include a period selector showing all `AssessmentPeriod` rows for the school's active CBE framework, with `isCurrent = true` pre-selected.
6. WHEN the teacher changes the learning area, strand, or sub-strand selector, THE grid SHALL reload the student rows and their current entries for the new scope without a full page reload.
7. THE grid SHALL display a summary footer showing the count of students at each performance level (EE, ME, AE, BE) and the count of Not_Yet_Entered for the current sub-strand.

---

### Requirement 4: Junior CBE — Genuine BE vs. Not_Yet_Entered

**User Story:** As an Exam Officer, I want the system to distinguish between a student explicitly assessed as Below Expectation and a student whose assessment has not yet been entered, so that analytics and reports are never misleading.

#### Acceptance Criteria

1. THE system SHALL represent Not_Yet_Entered as the absence of an `AssessmentItem` row for `(studentId, periodId, subStrandId)`.
2. THE system SHALL represent a Genuine_BE as an `AssessmentItem` row with `performanceLevel = BE`.
3. WHEN a teacher taps BE for a student, THE system SHALL create or update the `AssessmentItem` row with `performanceLevel = BE`.
4. WHEN a teacher taps the clear/reset control for a student row, THE system SHALL delete the `AssessmentItem` row, converting the entry to Not_Yet_Entered.
5. THE grid SHALL render Not_Yet_Entered rows with all four level buttons in ghost/outline style and no selection highlight.
6. THE grid SHALL render a Genuine_BE row with the BE button filled/highlighted (same visual treatment as EE, ME, AE).
7. WHEN displaying the summary footer, THE system SHALL count Not_Yet_Entered separately from BE. A not-yet-entered student SHALL NOT be included in the BE count.
8. Reports and dashboards SHALL display Not_Yet_Entered as "—" and SHALL NOT include those students in any performance-level aggregate.

---

### Requirement 5: Junior CBE — Batch Entry Mode

**User Story:** As a teacher, I want to assign the same performance level to multiple students at once (e.g. mark all present students as ME after a practical), so that entry for large classes is faster.

#### Acceptance Criteria

1. THE `CbeJuniorGrid` SHALL include a "Mark all as…" row of four buttons (EE, ME, AE, BE) at the top of the grid that applies the selected level to every student in the current sub-strand view.
2. WHEN a teacher taps "Mark all as ME", THE system SHALL set every student's entry for the current sub-strand to ME (upsert). Students who already have a higher or lower level SHALL be overwritten.
3. THE system SHALL save a batch entry with a single `POST /api/assessments/cbe/batch` call, not one call per student.
4. THE `CbeJuniorGrid` SHALL include a "Clear all" button that deletes every `AssessmentItem` for all students in the current sub-strand/period, converting all rows back to Not_Yet_Entered.
5. BEFORE executing a "Mark all" or "Clear all" action, THE system SHALL display an inline confirmation prompt (not a browser `confirm()` dialog) with the student count affected.

---

### Requirement 6: Junior CBE — Comment and Evidence

**User Story:** As a teacher, I want to add a short text comment to any individual student entry, so I can note evidence or context for the recorded level without leaving the grid.

#### Acceptance Criteria

1. EACH student row in `CbeJuniorGrid` SHALL include an "Add comment" affordance (e.g. a small icon button) that expands an inline text input when tapped.
2. THE comment SHALL be saved to `AssessmentItem.comment` on blur or explicit save.
3. A student row that already has a saved comment SHALL show a visible indicator (e.g. a filled comment icon).
4. Comments SHALL be saved via the same `PUT /api/assessments/cbe/item` endpoint used for performance level entry, included in the request body.
5. Clearing a student's entry (Requirement 4.4) SHALL also clear any existing comment for that entry.

---

### Requirement 7: Senior CBE Pathway Grid — Layout and Entry

**User Story:** As a teacher of a senior CBE pathway class, I want to enter both the school-based assessment score and the exam score for each student, so the system can compute the weighted combined score for each pathway subject.

#### Acceptance Criteria

1. THE `CbePathwayGrid` SHALL display one row per student, ordered by admission number.
2. EACH row SHALL display two numeric input fields per subject: "SBA Score" (school-based) and "Exam Score", with their respective maximum marks shown as column headers.
3. THE grid SHALL display a computed read-only "Weighted %" column per subject, calculated as `(sbaScore / sbaMaxMarks) * sbaWeight + (examScore / examMaxMarks) * examWeight`, expressed as a percentage.
4. THE `PathwayWeight` for each subject SHALL be loaded from the database and displayed as labels on the column headers (e.g. "SBA 60% · Exam 40%").
5. IF `PathwayWeight` has not been configured for a subject, THE grid SHALL use a default of SBA 60% / Exam 40% and display a "(default)" label.
6. THE computed "Weighted %" SHALL drive a KCSE-equivalent grade display for Senior CBE subjects, using the existing `scoreToGrade` function from `grading844.ts`.
7. Validation SHALL enforce `0 ≤ sbaScore ≤ sbaMaxMarks` and `0 ≤ examScore ≤ examMaxMarks` with the same inline error behaviour as the 8-4-4 `MarksheetGrid`.
8. THE "SBA Score" and "Exam Score" are stored as separate `AssessmentItem` rows: SBA uses `resultKind = NUMERIC` scoped to `subjectId`; Exam uses `resultKind = NUMERIC` scoped to `paperId` (where `Paper.code = 'EXAM'` by convention).

---

### Requirement 8: Pathway Weight Configuration

**User Story:** As a Principal, I want to configure the SBA-to-exam weighting per subject for senior CBE pathway classes, so that each vocational subject's assessment split reflects its curriculum specification.

#### Acceptance Criteria

1. A new `PathwayWeight` table SHALL store `(schoolId, frameworkId, subjectId, sbaWeight, examWeight, sbaMaxMarks, examMaxMarks)` with a unique constraint on `(frameworkId, subjectId)`.
2. `sbaWeight + examWeight` SHALL always equal 1.0 — enforced by a DB CHECK constraint.
3. THE principal SHALL be able to configure `PathwayWeight` via a page at `/principal/assessments/pathway-weights`.
4. WHEN no `PathwayWeight` row exists for a subject, THE system SHALL behave as if `sbaWeight = 0.6, examWeight = 0.4, sbaMaxMarks = 100, examMaxMarks = 100`.
5. Pathway weights SHALL be editable after creation. Changes take effect immediately on any new computation; existing stored scores are not retroactively recomputed (they are raw scores, not percentages).

---

### Requirement 9: Offline-First Entry and Sync

**User Story:** As a teacher doing a CBE assessment during a practical session away from Wi-Fi, I want to enter results offline and have them sync automatically when I reconnect, so that connectivity gaps never block assessment entry.

#### Acceptance Criteria

1. THE `CbeJuniorGrid` and `CbePathwayGrid` SHALL use an IndexedDB-backed sync queue (store name: `cbe_sync_queue`) to persist every write before attempting the network call.
2. WHEN the device is online, THE system SHALL attempt to flush the queue immediately after each write is enqueued.
3. WHEN the device is offline (detected via `navigator.onLine` and the `online`/`offline` events), THE system SHALL enqueue the write without attempting a network call and SHALL display a "Pending sync" badge in the grid header.
4. WHEN the device comes back online, THE system SHALL automatically flush all queued items by calling `POST /api/assessments/cbe/batch` in a single request (or multiple batches of ≤ 100 items each).
5. THE sync badge SHALL display the count of pending items (e.g. "12 pending sync") when `queue.length > 0`.
6. WHEN all items are successfully synced, THE badge SHALL change to "Synced" for 3 seconds then disappear.
7. WHEN a sync attempt fails (non-200 response or network error), THE system SHALL retain the items in the queue and SHALL display a "Sync failed — tap to retry" badge. The badge SHALL allow manual retry.
8. Each queue entry SHALL store: `{ id, studentId, periodId, subStrandId | criterionId, level | score, comment, timestamp, retries }`. Items with `retries >= 3` SHALL be marked as `stuck` and surfaced separately so the teacher can manually resolve them.
9. The queue MUST NOT lose data on page refresh — IndexedDB persistence is the guarantee.
10. WHEN the component unmounts with pending queue items, THE system SHALL NOT clear the queue.

---

### Requirement 10: Access Control for CBE Entry

**User Story:** As a Principal, I want the same role-based access rules applied to CBE entry as to 8-4-4 entry, so that only authorised teachers can record or modify results.

#### Acceptance Criteria

1. THE CBE entry APIs (`PUT /api/assessments/cbe/item`, `POST /api/assessments/cbe/batch`, `DELETE /api/assessments/cbe/item`) SHALL enforce the same `canEnterMarks` guard from `auth844.ts`, adapted for CBE scope:
   - PRINCIPAL → can enter any CBE item.
   - DIRECTOR / EXAM_OFFICER → can enter any CBE item.
   - CLASS_TEACHER (classTeacherOf matches) → can enter any sub-strand / criterion for their class.
   - SUBJECT_TEACHER scoped to a `learningAreaId` or `competencyUnitId` → can enter items within their scope only.
2. READ access to CBE marksheets SHALL follow `canViewMarksheet`, adapted for CBE scope.
3. All access checks SHALL be enforced server-side. Client-side hiding of controls is supplementary only.
4. CBE items for a student in a CBE class SHALL NOT be accessible via the 8-4-4 marksheet API endpoints, and vice versa. The APIs are separate.

---

### Requirement 11: CBE API Endpoints

**User Story:** As a developer, I want a clean set of CBE-specific API endpoints that mirror the 8-4-4 endpoints in structure but handle performance levels and competency statuses instead of numeric scores.

#### Acceptance Criteria

1. `GET /api/assessments/cbe/substrand-sheet` — returns the full student × sub-strand matrix for a given `(periodId, classId, subStrandId)`. Response mirrors the 8-4-4 marksheet shape but with `level: PerformanceLevel | null` instead of `scores`.
2. `PUT /api/assessments/cbe/item` — upsert or delete a single CBE item. Body: `{ periodId, studentId, subStrandId | criterionId, level: PerformanceLevel | null, comment?: string }`. `level = null` deletes the row.
3. `POST /api/assessments/cbe/batch` — batch upsert/delete. Same semantics as the 8-4-4 batch endpoint. All items must pass server-side validation before any write occurs.
4. `GET /api/assessments/cbe/learning-areas` — returns the hierarchy (learning areas → strands → sub-strands) for the school's active CBE framework, to populate the three-level selector.
5. All endpoints SHALL scope queries to `user.schoolId` and SHALL enforce appropriate `can*` guards.
6. The batch endpoint SHALL run all writes in a single Prisma `$transaction`.

---

### Requirement 12: CBE Dashboard

**User Story:** As a Principal or HOD, I want a CBE performance dashboard showing attainment distribution per sub-strand and per learning area across a class, so I can identify where learners need more support.

#### Acceptance Criteria

1. THE principal assessment dashboard page SHALL detect whether the selected class is CBE and render `CbeDashboard` instead of `DashboardCharts`.
2. `CbeDashboard` SHALL display, for the selected period and class:
   - Per sub-strand: a stacked bar showing EE / ME / AE / BE / Not-Yet-Entered counts.
   - Per learning area: an aggregated attainment score (mean of numeric performance level values: EE=4, ME=3, AE=2, BE=1, NYE excluded).
   - A student attainment table: one row per student, one column per sub-strand, each cell showing the level badge.
3. WHEN no entries exist for the period/class, `CbeDashboard` SHALL display an empty-state message, not empty charts.
4. The numeric mapping EE=4, ME=3, AE=2, BE=1 SHALL be defined in a new `src/lib/assessment/gradingCbe.ts` utility file (mirrors the role of `grading844.ts`).
