# Requirements Document

## Introduction

This feature delivers the complete end-to-end 8-4-4 assessment flow for a Kenyan secondary school management system. The deliverable covers three major surfaces: (1) a spreadsheet-style marksheet grid where teachers enter raw paper scores, (2) an analytics dashboard with KCSE performance metrics and trend visualisation, and (3) per-student report cards exportable as PDF. All three surfaces are backed by a set of REST API routes.

The system already has the underlying data models (`AssessmentFramework`, `AssessmentPeriod`, `Paper`, `AssessmentItem`, `AssessmentRole`) in the Prisma schema. This feature builds the UI and API layer on top of those models.

**Known constraint — SchoolClass frameworkType gap:** `SchoolClass` currently has no `frameworkType` field. 8-4-4 classes are identified by convention: a class whose school has an active `AssessmentFramework` of type `EIGHT_FOUR_FOUR` and whose `form` is an integer 1–4 is treated as an 8-4-4 class. A future migration to add `SchoolClass.frameworkType` is out of scope here; APIs must work with the class-level inference until that migration lands.

**Known constraint — Parent access out of scope:** `AssessmentRole.PARENT_VIEWER` exists in the enum but `AssessmentRole` references `Teacher`, not `User`. Parent-facing report card views require a separate `StudentParentLink` table and are explicitly out of scope for this stage.

---

## Glossary

- **Assessment_System**: The collective set of marksheet, dashboard, and report card subsystems described in this document.
- **Marksheet**: The spreadsheet-style grid UI where an authorised teacher enters raw numeric scores for students in a class, per subject and paper, for one assessment period.
- **Assessment_Period**: A named sitting (e.g. "Term 1 Opener 2026") scoped to a framework. Corresponds to the `AssessmentPeriod` database model.
- **Paper**: One marking unit within a subject (e.g. "Mathematics Paper 1"). Corresponds to the `Paper` database model. A subject may have 1 or 2 papers.
- **Subject_Score**: The weighted average of a student's paper scores for one subject within one period. Weights are proportional to `Paper.maxMarks`.
- **KCSE_Grade**: A letter grade on the 12-point KCSE scale: A (12), A− (11), B+ (10), B (9), B− (8), C+ (7), C (6), C− (5), D+ (4), D (3), D− (2), E (1).
- **Grade_Points**: The integer point value (1–12) corresponding to a KCSE_Grade.
- **Mean_Grade**: The arithmetic mean of all subject Grade_Points for a student in one period, rounded to two decimal places, then mapped back to a KCSE_Grade label.
- **Position**: A student's dense rank within their class, ordered by total Grade_Points descending. Ties share the same rank; the next distinct rank is incremented by 1 (dense rank, not standard rank).
- **Genuine_Zero**: A score of zero that was explicitly entered by a teacher — represented as an `AssessmentItem` row with `numericScore = 0`. This is semantically different from a missing score (no row). The system MUST preserve and display this distinction.
- **Not_Entered**: A result that has no `AssessmentItem` row. Displayed as a blank cell in the marksheet and as "—" on the report card. Never treated as zero in grade or mean computation.
- **Marksheet_Grid**: The specific React component that renders the student-by-paper matrix and handles score input.
- **Report_Card**: The per-student document showing all subjects, paper scores, grade, points, mean grade, and class position for one assessment period.
- **Dashboard**: The analytics page showing aggregate performance metrics, charts, and filters for an assessment period.
- **Exam_Officer**: A teacher assigned `AssessmentRoleType.EXAM_OFFICER` in `AssessmentRole` for the school's 8-4-4 framework.
- **HOD**: A teacher assigned `AssessmentRoleType.HOD` scoped to a specific subject in `AssessmentRole`.
- **Subject_Teacher**: A teacher assigned `AssessmentRoleType.SUBJECT_TEACHER` scoped to a specific subject.
- **Class_Teacher**: A teacher assigned `AssessmentRoleType.CLASS_TEACHER` or whose `Teacher.classTeacherOf` points to the class.
- **Director**: A user with role `PRINCIPAL` or a teacher assigned `AssessmentRoleType.DIRECTOR`.
- **KCSE_Grade_Scale**: The constant mapping from numeric percentage-equivalent to KCSE grade band, to be implemented in `src/lib/analytics/grading.ts`.
- **PDF_Export**: A server-rendered PDF document generated server-side (not a browser print).
- **Consolidated_PDF**: A single PDF file containing report cards for every student in a class, one student per page, generated in one request.

---

## Requirements

### Requirement 1: KCSE Grading Utility

**User Story:** As a developer, I want a centralised KCSE grading utility, so that every part of the system derives grades and points from the same single source of truth.

#### Acceptance Criteria

1. THE KCSE_Grade_Scale SHALL map a numeric subject score to a KCSE_Grade letter and Grade_Points integer using the following bands (score out of 100 equivalent): 75–100 → A (12), 70–74 → A− (11), 65–69 → B+ (10), 60–64 → B (9), 55–59 → B− (8), 50–54 → C+ (7), 45–49 → C (6), 40–44 → C− (5), 35–39 → D+ (4), 30–34 → D (3), 25–29 → D− (2), 0–24 → E (1).
2. WHEN a subject has two papers, THE KCSE_Grade_Scale SHALL compute the Subject_Score as the weighted average: `(paper1Score * paper1MaxMarks + paper2Score * paper2MaxMarks) / (paper1MaxMarks + paper2MaxMarks)`, scaled to a percentage.
3. WHEN a subject has one paper, THE KCSE_Grade_Scale SHALL compute the Subject_Score as `(paperScore / paper.maxMarks) * 100`.
4. THE KCSE_Grade_Scale SHALL accept a raw percentage (0–100) and return both the grade letter and the Grade_Points integer.
5. IF a subject score cannot be computed because one or more required paper scores are Not_Entered, THEN THE KCSE_Grade_Scale SHALL return null for that subject's grade and points, and SHALL NOT substitute zero or any default value.
6. THE KCSE_Grade_Scale SHALL be implemented as a pure function in `src/lib/analytics/grading.ts` with no database dependency, so it can be called from both server and client contexts.

---

### Requirement 2: Genuine Zero vs. Not Entered

**User Story:** As an Exam Officer, I want the system to preserve the distinction between a student who scored zero and a student whose mark has not been entered, so that absent-mark and genuine-zero cases are never confused in reports or analytics.

#### Acceptance Criteria

1. THE Assessment_System SHALL represent a Genuine_Zero as an `AssessmentItem` row where `numericScore = 0`.
2. THE Assessment_System SHALL represent a Not_Entered result as the absence of an `AssessmentItem` row for that `(studentId, periodId, paperId)` combination.
3. WHEN displaying the Marksheet_Grid, THE Assessment_System SHALL render a Genuine_Zero cell as "0" and a Not_Entered cell as an empty input field.
4. WHEN computing a Subject_Score, THE Assessment_System SHALL exclude any subject where one or more required paper scores are Not_Entered, and SHALL NOT treat Not_Entered as zero.
5. WHEN computing Mean_Grade, THE Assessment_System SHALL include only subjects for which a valid Subject_Score exists (i.e., all required papers are entered), and SHALL NOT penalise students for subjects that are Not_Entered.
6. WHEN a teacher clears a cell that previously held a Genuine_Zero, THE Assessment_System SHALL delete the `AssessmentItem` row, converting the state back to Not_Entered.
7. THE Assessment_System SHALL display Not_Entered results as "—" (em dash) on the Report_Card and in all analytics views.

---

### Requirement 3: Access Control for Assessment Actions

**User Story:** As a Principal, I want role-based access control that limits who can enter, review, and publish marks, so that data integrity is protected throughout the assessment cycle.

#### Acceptance Criteria

1. WHEN a user attempts to enter marks in the Marksheet, THE Assessment_System SHALL permit this action only if the user holds `AssessmentRoleType.SUBJECT_TEACHER` for the subject, `AssessmentRoleType.CLASS_TEACHER` for the class, `AssessmentRoleType.EXAM_OFFICER`, or `AssessmentRoleType.DIRECTOR`; otherwise THE Assessment_System SHALL return HTTP 403.
2. WHEN a user attempts to view any marksheet for any class, THE Assessment_System SHALL permit read access to users with `AssessmentRoleType.HOD` (for subjects in their scope), `AssessmentRoleType.EXAM_OFFICER`, `AssessmentRoleType.DIRECTOR`, or a Principal (`User.role = PRINCIPAL`).
3. WHEN a user attempts to access the Dashboard, THE Assessment_System SHALL permit this action for users with `AssessmentRoleType.HOD`, `AssessmentRoleType.EXAM_OFFICER`, `AssessmentRoleType.DIRECTOR`, or `User.role = PRINCIPAL`.
4. WHEN a user attempts to generate or download a Report_Card, THE Assessment_System SHALL permit this action for users with `AssessmentRoleType.CLASS_TEACHER` for the student's class, `AssessmentRoleType.EXAM_OFFICER`, `AssessmentRoleType.DIRECTOR`, or `User.role = PRINCIPAL`.
5. WHEN an ADMIN_STAFF user attempts to access any assessment route, THE Assessment_System SHALL check that the user's `StaffRole` grants `canView` or `canManage` for the `ASSESSMENTS` module; otherwise THE Assessment_System SHALL return HTTP 403.
6. THE Assessment_System SHALL enforce all access checks on the server via API route guards, not solely on the client via UI hiding.

---

### Requirement 4: Marksheet Grid — Layout and Display

**User Story:** As a Subject Teacher, I want a spreadsheet-style grid showing all students in a class with columns for each paper of my subject, so that I can see the state of mark entry at a glance.

#### Acceptance Criteria

1. WHEN an authorised user opens a marksheet for a given `(classId, subjectId, periodId)`, THE Marksheet_Grid SHALL display one row per student enrolled in the class, ordered by student admission number.
2. THE Marksheet_Grid SHALL display one column per `Paper` associated with the subject, ordered by `Paper.sortOrder`, plus computed read-only columns for Subject_Score (percentage), KCSE_Grade letter, and Grade_Points.
3. WHEN a paper score cell contains a Genuine_Zero, THE Marksheet_Grid SHALL display "0" in the cell.
4. WHEN a paper score cell has no corresponding `AssessmentItem` row, THE Marksheet_Grid SHALL display an empty input field.
5. THE Marksheet_Grid SHALL display a summary row at the bottom of the grid showing the class mean per paper column and the class mean Subject_Score, KCSE_Grade, and Grade_Points.
6. WHEN a cell's computed Subject_Score maps to a grade, THE Marksheet_Grid SHALL colour-code the Grade column cell using the KCSE grade band: A/A− in green, B+/B/B− in blue, C+/C/C− in amber, D+/D/D− in orange, E in red.
7. THE Marksheet_Grid SHALL display the student's full name and admission number in the first two columns, which SHALL remain frozen (sticky) when scrolling horizontally.
8. WHEN all paper scores for a student are Not_Entered, THE Marksheet_Grid SHALL display "—" in the Subject_Score, Grade, and Points columns for that student.

---

### Requirement 5: Marksheet Grid — Score Entry and Validation

**User Story:** As a Subject Teacher, I want to type scores directly into the grid cells with immediate validation, so that I can enter marks quickly and confidently without submitting invalid data.

#### Acceptance Criteria

1. WHEN a user types a numeric value into a paper score cell, THE Marksheet_Grid SHALL accept only non-negative numbers up to and including the `Paper.maxMarks` value for that column.
2. IF a user types a value greater than `Paper.maxMarks`, THEN THE Marksheet_Grid SHALL display an inline validation error on that cell and SHALL NOT save the value.
3. IF a user types a non-numeric string in a paper score cell, THEN THE Marksheet_Grid SHALL reject the input and preserve the previous cell value.
4. WHEN a user enters a valid score in a cell and moves focus away (blur or Tab/Enter), THE Marksheet_Grid SHALL auto-save that single cell by calling the score-save API immediately, without requiring a separate "Save All" button press.
5. WHEN a cell is being saved, THE Marksheet_Grid SHALL display a loading indicator on that cell and SHALL prevent duplicate submissions for the same cell.
6. WHEN a cell save succeeds, THE Marksheet_Grid SHALL immediately recompute and update the Subject_Score, Grade, Points, and summary row for that student's row without a full page reload.
7. IF a cell save fails due to a network or server error, THEN THE Marksheet_Grid SHALL display an error indicator on the affected cell and SHALL preserve the user's typed value so they can retry.
8. WHEN a user presses Tab after entering a score, THE Marksheet_Grid SHALL advance focus to the next paper column for the same student, or to the first paper column of the next student when the last paper in the row is reached.
9. WHEN a user presses Enter after entering a score, THE Marksheet_Grid SHALL advance focus to the same paper column of the next student row.
10. WHEN a user presses the up or down arrow keys while a cell is focused, THE Marksheet_Grid SHALL move focus to the same column in the previous or next student row respectively.

---

### Requirement 6: Marksheet Grid — Paste from Spreadsheet

**User Story:** As a Subject Teacher, I want to paste a block of scores copied from Microsoft Excel or Google Sheets directly into the grid, so that I can bulk-enter marks without typing each cell individually.

#### Acceptance Criteria

1. WHEN a user pastes clipboard content into a focused paper column cell, THE Marksheet_Grid SHALL detect tab-separated or comma-separated numeric values arranged in a rectangular block.
2. THE Marksheet_Grid SHALL map pasted values to the grid starting from the focused cell, filling downward row by row.
3. WHEN pasted values are applied, THE Marksheet_Grid SHALL validate each value against its column's `Paper.maxMarks` before saving; cells with out-of-range or non-numeric values SHALL be highlighted as errors and SHALL NOT be saved.
4. WHEN all pasted values pass validation, THE Marksheet_Grid SHALL save all valid cells in a single batch API call.
5. IF the pasted block extends beyond the last student row, THEN THE Marksheet_Grid SHALL ignore the excess rows and SHALL display a warning indicating how many rows were truncated.
6. IF the pasted block extends beyond the last paper column, THEN THE Marksheet_Grid SHALL ignore the excess columns.

---

### Requirement 7: Marksheet — Period and Subject Selection

**User Story:** As a Subject Teacher or Exam Officer, I want to select the assessment period, class, and subject before viewing or entering marks, so that I always enter data against the correct sitting.

#### Acceptance Criteria

1. THE Marksheet SHALL present a period selector showing all `AssessmentPeriod` records for the school's active `EIGHT_FOUR_FOUR` framework, with the period whose `isCurrent = true` pre-selected.
2. THE Marksheet SHALL present a class selector filtered to classes in forms 1–4 of the current school.
3. THE Marksheet SHALL present a subject selector showing subjects applicable to the selected class's `form` value (using `Subject.applicableForms`), filtered to subjects the signed-in user is authorised to enter for.
4. WHEN a Subject_Teacher selects a subject they are not assigned to, THE Marksheet SHALL display an access-denied message and SHALL NOT render the grid.
5. WHEN no `AssessmentPeriod` exists with `isCurrent = true`, THE Marksheet SHALL display an informational message and SHALL offer a list of all periods for manual selection.

---

### Requirement 8: Position Ranking

**User Story:** As a Class Teacher, I want students ranked by total grade points within their class for each assessment period, so that I can report class position accurately on report cards.

#### Acceptance Criteria

1. THE Assessment_System SHALL compute a student's total Grade_Points as the sum of Grade_Points across all subjects for which a valid Subject_Score exists in the period.
2. THE Assessment_System SHALL compute Position using dense rank: students are ordered by total Grade_Points descending, ties share the same rank, and the next distinct rank is the next integer (e.g., two students tied at rank 2 are both rank 2; the next student is rank 3, not rank 4).
3. THE Assessment_System SHALL scope Position to the student's `SchoolClass` — students in different classes are ranked independently.
4. WHEN a student has valid scores for zero subjects in a period, THE Assessment_System SHALL assign that student no Position (displayed as "—") rather than ranking them last.
5. WHEN students have equal total Grade_Points, THE Assessment_System SHALL assign them identical Position values.

---

### Requirement 9: Dashboard — Metrics and Filters

**User Story:** As a Principal or HOD, I want an analytics dashboard for a selected assessment period showing class and subject performance at a glance, so that I can identify strengths and areas needing intervention.

#### Acceptance Criteria

1. THE Dashboard SHALL provide filter controls for: Assessment_Period (required), Class (optional, defaults to all classes), Subject (optional, defaults to all subjects), and Form level (optional: 1, 2, 3, or 4).
2. WHEN filters are applied, THE Dashboard SHALL display the following aggregate metrics: mean Subject_Score per subject, mean Grade_Points per subject, and the overall school mean grade for the selected period and scope.
3. THE Dashboard SHALL display a subject performance bar chart showing mean grade per subject, sorted by mean grade descending.
4. THE Dashboard SHALL display a grade distribution chart showing the count of students achieving each KCSE_Grade (A through E) for the selected scope.
5. THE Dashboard SHALL display a class comparison table showing, for each class in scope: mean total Grade_Points, mean grade letter, number of students ranked A or A−, and number of students ranked E.
6. THE Dashboard SHALL display a trend line chart showing mean Grade_Points per period across all available `AssessmentPeriod` records for the selected framework and class scope, ordered chronologically.
7. THE Dashboard SHALL display a heatmap of mean Subject_Score per subject per class, where rows are subjects and columns are classes, colour-coded by grade band.
8. WHEN a filter selection results in no students with entered marks, THE Dashboard SHALL display an empty-state message and SHALL NOT render charts with misleading zero values.
