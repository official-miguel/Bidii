# Requirements Document: Examination & Analytics Module (Stage 6)

## Introduction

Stage 6 delivers the unified product shell that surfaces the existing 8-4-4 (Stage 1) and CBE (Stage 2) assessment work as one coherent, role-aware application. The module adds: a role-aware home screen for each user type, a department-level analytics layer, a staff performance and teacher ranking feature, a report generation surface with AI-drafted remarks, and a unified Settings hub that consolidates API integrations and ranking configuration in one place.

**Schema changes in this stage:**
Two new Prisma models are added via a single migration (`20260720000000_add_ranking_config_and_report_remark`):
- `RankingConfig` — one row per school storing the three composite-score weights (improvementWeight, completionWeight, absoluteWeight) plus `updatedAt`. HOD and Director can edit these in Exam Setup / Settings.
- `ReportRemark` — one row per `(schoolId, periodId, studentId)` storing the AI-drafted remark (`draftRemark`) and any teacher-edited override (`editedRemark`).

**Scope boundary with previous stages:**
- `MarksheetGrid`, `CbeJuniorGrid`, `CbePathwayGrid`, `DashboardCharts`, `CbeDashboardEnhanced`, `ReportCard`, `CbeReportCard`, and `AssessmentAiPanel` are complete and are reused unchanged or lightly extended.
- New work is: the navigation shell, home screens, department analytics API and charts, staff ranking API and UI, report remarks API, mobile-responsive wiring, schema migration, and the unified Settings hub.

---

## Glossary

- **Examination_Module**: The full Stage 6 feature set described in this document — navigation shell, home screens, dept analytics, ranking, and report surface.
- **RoleNav**: The single collapsible left-hand sidebar (or bottom bar on mobile) that renders only the nav items relevant to the signed-in role.
- **TopBar**: The persistent header showing the module name, a single term/exam-period selector, and the user name/role badge.
- **TeacherHome**: The home screen for Subject_Teacher and Class_Teacher roles, showing My Classes cards with marks-entry progress.
- **HodHome**: The home screen for HOD and Exam_Officer roles, showing department summary tiles and a unified class table.
- **DirectorHome**: The home screen for Principal and Director roles, showing school-wide summary tiles, a unified class table, and a Staff Performance shortcut.
- **ParentHome**: The home screen for Parent-linked users, showing one card per linked child.
- **UnifiedClassTable**: A shared component used on HodHome and DirectorHome showing all classes (both frameworks) in a single table with framework badges.
- **DeptAnalytics**: The department-scoped analytics view showing four charts: dept mean trend, subject comparison bar, dept vs. school line, and dept heatmap.
- **StaffPerformance**: The teacher ranking surface accessible to Director (full list), HOD (dept list), and Subject_Teacher (own rank + top 3).
- **Top3Leaderboard**: The podium-style card showing only the top three ranked teachers by name and subject.
- **TeacherRankingService**: The server-side utility (`src/lib/assessment/teacherRanking.ts`) that computes composite teacher scores from class mean improvement, mark-entry completion, and absolute class mean.
- **ReportPage**: The report generation surface showing a preview pane, AI-drafted remarks editor, and Download/Email actions.
- **AI_Remarks**: AI-generated per-student comments drafted by the `AssessmentAiPanel` service, surfaced in a shaded edit box on the ReportPage.
- **Framework_Badge**: A small colour-coded pill on the UnifiedClassTable indicating whether a class uses 8-4-4 or CBE.
- **Entry_Completion_Pct**: The percentage of students in scope who have at least one `AssessmentItem` row for the current period.
- **Composite_Score**: The weighted combination of improvement score, completion score, and absolute class mean used to rank teachers.
- **RankingConfig**: The persisted per-school Prisma model (`RankingConfig`) that stores the three composite-score weight values. One row per school; created with defaults (0.4 / 0.3 / 0.3) on first access.
- **ReportRemark**: The persisted per-`(schoolId, periodId, studentId)` Prisma model that stores both the AI-drafted remark and any teacher-edited override.
- **SettingsHub**: The unified `/principal/settings` page restructured as a tabbed or sectioned shell with sub-pages: **API Integrations** (existing SchoolIntegration keys), **Ranking Configuration** (ranking weights), and **Exam Setup** (assessment period management).

---

## Requirements

### Requirement 1: Role-Aware Navigation Shell

**User Story:** As any user of the system, I want a single navigation sidebar showing only the items relevant to my role, so that the interface is uncluttered and I can find my tasks without hunting through irrelevant options.

#### Acceptance Criteria

1. THE RoleNav SHALL display navigation items scoped to the signed-in user's assessment role, with absent items not rendered rather than greyed out or hidden behind a lock icon.
2. WHEN a Subject_Teacher is signed in, THE RoleNav SHALL display: My Classes (→ Marks Entry), My Dashboard, and My Ranking.
3. WHEN a Class_Teacher is signed in, THE RoleNav SHALL display the Subject_Teacher items plus: Class Overview.
4. WHEN an HOD or Exam_Officer is signed in, THE RoleNav SHALL display the Class_Teacher items plus: Department Analytics, School Analytics, and Exam Setup.
5. WHEN a Director or Principal is signed in, THE RoleNav SHALL display all HOD items plus: School Analytics (full), Staff Performance, and Admin Controls.
6. WHEN a Parent-linked user is signed in, THE RoleNav SHALL display: My Child and Reports only.
7. THE TopBar SHALL display the module name "Examination & Analytics", a single term/exam-period dropdown, and the user's name and role badge. THE TopBar SHALL contain no other interactive controls.
8. THE TopBar SHALL NOT display a curriculum framework toggle. THE Examination_Module SHALL resolve the framework automatically from `SchoolClass.frameworkType`.
9. WHEN the viewport width is less than 768 px, THE RoleNav SHALL collapse to a bottom navigation bar displaying the top four items for the role as icon buttons.

---

### Requirement 2: Teacher Home Screen

**User Story:** As a Subject Teacher or Class Teacher, I want a home screen that shows exactly what I still need to do — which classes have incomplete mark entry — so that I never have to search for my remaining tasks.

#### Acceptance Criteria

1. THE TeacherHome SHALL display one card per (class, subject) combination the teacher is assigned to for the current assessment period.
2. EACH card SHALL display: the class name, the subject name, an entry progress indicator in the format "N/M marks entered", and a single **Enter Marks** button.
3. THE entry progress indicator SHALL count `enteredCount` as the number of students in the class who have at least one `AssessmentItem` row for the teacher's subject in the current period.
4. THE TeacherHome SHALL NOT display any analytics charts. The screen SHALL answer only "what do I still need to do?"
5. WHEN all marks for a class/subject are entered (`enteredCount = totalStudents`), THE card SHALL visually indicate completion (e.g. a checkmark or "Complete" label).
6. WHEN a teacher clicks **Enter Marks** on a card, THE system SHALL navigate to the marksheet for that class, subject, and period.
7. WHEN no assessment period has `isCurrent = true`, THE TeacherHome SHALL display a message "No active assessment period" instead of class cards.
8. WHEN a class has no marks entered yet for the period, THE card SHALL display "No marks entered yet for [Period Name] — tap Enter Marks to get started" as the progress label.

---

### Requirement 3: Marks Entry — Done Action

**User Story:** As a Subject Teacher, after I finish entering marks, I want a clear primary action that takes me straight to my class's dashboard, so that I can immediately review the results without navigating manually.

#### Acceptance Criteria

1. THE marksheet page SHALL display a **"Done — View Class Summary"** button fixed at the bottom of the screen, visible at all times while the marksheet is open.
2. WHEN a teacher clicks **"Done — View Class Summary"**, THE system SHALL navigate to the dashboard filtered to the class and period currently loaded in the marksheet.
3. THE **"Done — View Class Summary"** button SHALL be the single primary action at the bottom of the marksheet. No secondary "Save All" or "Submit" button SHALL compete with it.

---

### Requirement 4: HOD and Director Home Screens

**User Story:** As an HOD or Director, I want a home screen showing summary tiles for my department or school and a unified class table, so that I can immediately see the health of assessment entry and performance across my scope.

#### Acceptance Criteria

1. THE HodHome SHALL display four summary tiles for the HOD's department: Department Mean (grade letter), Weakest Subject in Department, Learners Flagged At-Risk count, and Entry Completion %.
2. THE DirectorHome SHALL display five summary tiles for the whole school: School Mean (grade letter), Top Performing Subject, Learners Flagged At-Risk count, Entry Completion %, and Total Teaching Staff count.
3. BOTH HodHome and DirectorHome SHALL display a UnifiedClassTable below the tiles showing all classes in scope (HOD: dept-scoped classes; Director: all classes).
4. EACH row in the UnifiedClassTable SHALL display: class name, form, a Framework_Badge, mean grade, student count, Entry_Completion_Pct, and links to the class marksheet and dashboard.
5. THE Framework_Badge SHALL visually distinguish 8-4-4 classes from CBE classes using distinct colour coding.
6. THE DirectorHome SHALL display a shortcut tile or button into Staff Performance.
7. WHEN the selected period has no entries for a class, THE UnifiedClassTable SHALL display "—" for that class's mean grade and Entry_Completion_Pct as 0%.

---

### Requirement 5: Parent Home Screen

**User Story:** As a Parent, I want a home screen showing a card for each of my children, so that I can tap directly into their latest report without navigating through administrative screens.

#### Acceptance Criteria

1. THE ParentHome SHALL display one card per linked child, showing the child's name, class name, and a link to their latest report summary.
2. WHEN a parent taps a child's card, THE system SHALL navigate directly to that child's latest available report card for the current period.
3. THE ParentHome SHALL display no administrative controls, analytics charts, or navigation items outside of My Child and Reports.

---

### Requirement 6: Department Analytics

**User Story:** As an HOD or Director, I want a dedicated department analytics view showing four charts scoped to my department's subjects and classes, so that I can understand performance trends, weak spots, and how my department compares to the school average.

#### Acceptance Criteria

1. THE DeptAnalytics page SHALL be accessible via a department dropdown — no separate navigation structure per department. The dropdown SHALL be the only selector needed to switch department context.
2. WHEN an HOD accesses DeptAnalytics, THE system SHALL scope all data to the HOD's own department only. THE system SHALL return HTTP 403 if an HOD requests data for a department other than their own.
3. WHEN a Director or Principal accesses DeptAnalytics, THE system SHALL permit selection of any department via the dropdown.
4. THE DeptAnalytics page SHALL display four charts: (a) Department Mean Trend — a line chart of department mean grade points across all available assessment periods; (b) Subject-Within-Department Bar — a bar chart showing every subject in the department side by side with mean grade; (c) Department vs. School Average Line — a line chart showing department mean alongside whole-school mean on the same axes; (d) Department Heatmap — a class × subject heatmap scoped to that department's subjects only.
5. ALL four charts SHALL use the identical red-to-green colour scale used throughout the module.
6. EVERY chart SHALL have a one-line plain-English caption above it.
7. WHEN DeptAnalytics data contains partial entries, THE page SHALL display "Showing partial results — N subjects still pending" and SHALL NOT render charts with misleading zero-filled segments.
8. WHEN hovering or tapping any bar, point, or cell in a DeptAnalytics chart, THE system SHALL display a tooltip with the exact value and the item it belongs to.
9. THE `GET /api/assessments/department/analytics` endpoint SHALL scope its Prisma queries to the requesting user's `schoolId` and SHALL enforce the HOD department-scope guard server-side.

---

### Requirement 7: Staff Performance and Teacher Ranking

**User Story:** As a Director or HOD, I want to see a ranked list of teachers by performance so that I can identify staff who need support. As a teacher, I want to see my own rank and the top performers so that I feel recognised without feeling exposed.

#### Acceptance Criteria

1. THE TeacherRankingService SHALL compute a Composite_Score for each teacher using three components: class mean improvement over the previous period, Entry_Completion_Pct for the current period, and absolute class mean grade points. Default weights SHALL be 40% improvement, 30% completion, and 30% absolute.
2. THE Composite_Score weights (improvementWeight, completionWeight, absoluteWeight) SHALL be persisted in the `RankingConfig` Prisma model — one row per school. WHEN a HOD or Director saves new weights via the Settings → Ranking Configuration sub-page, THE system SHALL update the `RankingConfig` row via `PUT /api/settings/ranking-config`. Weight changes SHALL apply to all subsequent ranking computations. Historical `compositeScore` values are computed on-the-fly and are not stored, so past period rankings automatically reflect the current weights when re-fetched.
3. WHEN a Subject_Teacher accesses My Ranking, THE system SHALL return only that teacher's own rank/score/trend and the Top3Leaderboard. THE response SHALL NOT include the rank or name of any other teacher outside the top 3.
4. WHEN an HOD accesses Staff Performance, THE system SHALL return a ranked list scoped to teachers in the HOD's department only.
5. WHEN a Director or Principal accesses Staff Performance, THE system SHALL return the full ranked list of all teachers, sortable by subject, department, or trend direction.
6. THE Top3Leaderboard SHALL display the top three teachers as a podium-style card with crown icon on first place, showing name and subject only.
7. WHEN a teacher's rank improves compared to the previous period, THE system SHALL display an upward trend indicator. WHEN rank declines, THE system SHALL display a downward trend indicator.
8. THE staff ranking SHALL be framed as recognition and coaching data. THE page title and any surrounding copy SHALL not use language implying punishment or public shaming.

---

### Requirement 8: Report Page — AI-Drafted Remarks

**User Story:** As a Class Teacher or Exam Officer, I want to generate a report card with an AI-drafted remark pre-filled, so that I can review and personalise comments efficiently rather than writing each one from scratch.

#### Acceptance Criteria

1. THE ReportPage SHALL display a single **Generate Report** button as the primary action. No additional configuration screen SHALL be presented unless the user explicitly opens "Report Settings."
2. THE report preview SHALL render in a print-styled pane visually distinct from the dashboard (white background, document-style typography).
3. THE ReportPage SHALL render `ReportCard` for students in 8-4-4 classes and `CbeReportCard` for students in CBE classes, determined by `SchoolClass.frameworkType` — no manual framework selection.
4. WHEN AI remarks are available, THE ReportPage SHALL display the AI-drafted remark in a lightly shaded box labelled "AI-drafted comment — review before sending" with an inline edit field immediately beneath it.
5. WHEN an authorised user edits the AI remark and saves it, THE system SHALL persist the edited remark via `PUT /api/assessments/report/remarks` and SHALL display the edited version in all subsequent previews and PDFs for that student and period.
6. THE ReportPage SHALL display exactly two action buttons: **Download PDF** and **Email to Parent**. No other actions SHALL appear at the primary level.
7. IF the AI remarks service is unavailable or returns an error, THE ReportPage SHALL display a blank editable remarks field with a notice "AI remarks unavailable — add comments manually." Report generation SHALL proceed normally without remarks.
8. WHEN a user clicks **Download PDF**, THE system SHALL generate a print-styled PDF for the selected student(s) and initiate a browser download.

---

### Requirement 9: Unified Dashboard — Chart Interaction

**User Story:** As any analytics viewer, I want all charts across the module to behave consistently — hover for values, click to drill down, identical colour coding — so that I only need to learn one mental model regardless of the chart type or framework.

#### Acceptance Criteria

1. WHEN a user hovers or taps any bar, point, or cell across any chart in the module, THE system SHALL display a tooltip showing the exact numeric value and the item label it belongs to.
2. WHEN a user clicks a bar or segment in any chart, THE system SHALL drill down to the subject's own trend and class breakdown for that subject.
3. THE red-to-green colour scale SHALL be identical across every chart type, every framework (8-4-4 and CBE), and every department — mapping the same grade bands or performance levels to the same colours throughout the module.
4. EVERY chart SHALL display a one-line plain-English caption above the chart area.
5. WHEN a chart's data array is empty, THE chart component SHALL render its own empty-state message rather than an empty chart frame.
6. WHEN dashboard data is partially complete (some subjects pending entry), THE dashboard SHALL display "Showing partial results — N subjects still pending" and SHALL NOT render charts that silently treat missing data as zero.

---

### Requirement 10: Mobile Behaviour

**User Story:** As any user on a mobile device, I want the module to remain fully usable with appropriate tap targets, stacked layouts, and swipeable chart navigation, so that I can complete every task on a phone without a desktop.

#### Acceptance Criteria

1. WHEN the viewport width is less than 768 px, THE RoleNav SHALL collapse to a 4-icon bottom navigation bar matching the role's top-level items.
2. WHEN a teacher opens the marks entry grid on a screen narrower than 768 px, THE marksheet SHALL present one student at a time as a swipeable card with large tap targets for CBE level pills and a numeric keypad for 8-4-4 scores.
3. WHEN viewing any dashboard on a screen narrower than 768 px, THE summary tiles SHALL stack vertically and charts SHALL render full-width, one at a time, navigable by swipe or scroll.
4. THE Top3Leaderboard SHALL render as a compact horizontal-scroll card on the teacher home screen on mobile.

---

### Requirement 11: Empty and Loading States

**User Story:** As any user, I want the module to always explain what is happening or what I should do next — never a blank screen or a chart that silently renders with no data.

#### Acceptance Criteria

1. WHEN a class has no marks entered for the current period, THE system SHALL display the message: "No marks entered yet for [Period Name] — tap Enter Marks to get started."
2. WHEN a dashboard has incomplete data, THE system SHALL display: "Showing partial results — [N] subjects still pending" rather than rendering misleading charts.
3. WHEN data is being fetched, THE system SHALL display a contextual loading indicator. THE indicator SHALL NOT be a generic full-page spinner.
4. WHEN an API call fails, THE affected section SHALL display an error message specific to that section rather than crashing the entire page.

---

### Requirement 12: Access Control — New Endpoints

**User Story:** As a Principal, I want all new API endpoints in Stage 6 to enforce the same role-based access model as existing assessment endpoints, so that no new surface bypasses the established security model.

#### Acceptance Criteria

1. THE `GET /api/assessments/home/teacher` endpoint SHALL return data only for the authenticated teacher's own assigned classes and subjects. It SHALL return HTTP 403 for any unauthenticated request.
2. THE `GET /api/assessments/home/summary` endpoint SHALL return department-scoped data to HOD users and school-scoped data to Director/Principal users. It SHALL return HTTP 403 if a teacher-role user requests summary data.
3. THE `GET /api/assessments/department/analytics` endpoint SHALL enforce that an HOD can only request their own department's data. Requests for another department SHALL return HTTP 403.
4. THE `GET /api/assessments/staff/ranking` endpoint SHALL enforce visibility rules server-side: a teacher-role response SHALL contain `fullList: []` regardless of any client-supplied parameter attempting to request the full list.
5. THE `GET /api/assessments/report/remarks` and `PUT /api/assessments/report/remarks` endpoints SHALL enforce `canGenerateReportCard(actor, classId)` — the same guard used by the existing report-card endpoints.
6. ALL new endpoints SHALL scope every Prisma query to `user.schoolId`. No query SHALL return data from another school.

---

### Requirement 13: Settings Hub — API Integrations and Ranking Configuration

**User Story:** As a Principal or Director, I want a single, clearly organised Settings area where I can manage all school-level configuration — API keys, AI integrations, and ranking weights — without hunting across different parts of the product.

#### Acceptance Criteria

1. THE `/principal/settings` page SHALL be restructured as a hub with three clearly labelled sections (tabs or anchored sections): **API Integrations**, **Ranking Configuration**, and **Exam Setup**.
2. THE **API Integrations** section SHALL display the existing `SchoolIntegration` provider cards (Gemini, Google Calendar, SMS, WhatsApp, Email) exactly as they are rendered today in the current `IntegrationSettingsPage` — no behaviour change, only relocation into the hub.
3. THE **Ranking Configuration** section SHALL display three numeric weight fields: Improvement Weight, Completion Weight, and Absolute Mean Weight. Each field SHALL show the current persisted value from `RankingConfig` (defaulting to 0.4 / 0.3 / 0.3 if no row exists yet for the school).
4. WHEN the three Ranking Configuration weight values do not sum to 1.0 (within a tolerance of 0.001), THE form SHALL display a validation error "Weights must sum to 100%" and SHALL NOT submit.
5. WHEN a HOD or Director saves valid weight values, THE system SHALL call `PUT /api/settings/ranking-config` which upserts the `RankingConfig` row for the school. THE response SHALL return the saved values, which the form SHALL reflect immediately.
6. THE `PUT /api/settings/ranking-config` endpoint SHALL return HTTP 403 for any user whose assessment role is below HOD (i.e., SUBJECT_TEACHER, CLASS_TEACHER, PARENT_VIEWER).
7. THE **Exam Setup** section SHALL provide a shortcut link or embedded view to assessment period management — the existing `/principal/assessments/exam-setup` functionality, surfaced here for discoverability.
8. THE Settings Hub SHALL be accessible from the RoleNav for Director and Principal roles. HOD users SHALL be able to access the Ranking Configuration section directly via a link from the Staff Performance page.
9. WHEN a `RankingConfig` row does not yet exist for a school, `GET /api/settings/ranking-config` SHALL return the default weights `{ improvementWeight: 0.4, completionWeight: 0.3, absoluteWeight: 0.3 }` without creating a DB row. The row SHALL be created only on the first `PUT` save.
