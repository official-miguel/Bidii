# Requirements Document

## Introduction

The **Exam Analysis Filter Chain** feature introduces a reusable `ExamFilterBar` component that replaces the inconsistent, non-cascading filter controls scattered across the Exams & Analysis section of the school management system.

Currently, each assessment page (MarksheetGrid, DashboardCharts, DeptAnalyticsPage) implements its own independent filter selects with no dependency between them. The "Form" and "Class" concepts conflict in DashboardCharts, there is no "Stream" concept, and subjects are not filtered by the selected class's applicable forms.

The new component enforces a single cascading selection sequence: **Exam Period → Form → Stream → Subject**, where each dropdown's options depend on the previous selection. The component manages state internally and emits a structured callback when the selection is complete or changes. It is then adopted by all existing assessment pages, replacing their current ad-hoc filters.

---

## Glossary

- **ExamFilterBar**: The new reusable React client component that renders the four cascading filter dropdowns and manages their state.
- **AssessmentPeriod**: A database record representing one exam sitting (e.g. "Term 1 2024"). Fields relevant here: `id`, `name`, `academicYear`, `term`, `isCurrent`, `schoolId`.
- **Form**: An integer (1–6) representing the year group within a school. Derived from `SchoolClass.form`.
- **SchoolClass**: A database record representing one physical stream/section. Fields: `id`, `name`, `form`, `frameworkType`, `schoolId`. E.g. `{ form: 2, name: "Form 2 North" }`.
- **Stream**: One `SchoolClass` record that shares the same `form` number as one or more sibling classes in the same school. When multiple `SchoolClass` records have the same `form`, each is a different stream of that form.
- **Subject**: A database record with `id`, `name`, `code`, `applicableForms` (int[]), `schoolId`. `applicableForms` lists the form numbers for which the subject is offered.
- **FilterSelection**: The structured object emitted by `ExamFilterBar` when the user's selection is actionable: `{ periodId: string; classId: string; subjectId: string; form: number }`.
- **FilterState**: The internal state of `ExamFilterBar`, including partially-complete selections (e.g. period chosen but form not yet chosen).
- **isCurrent**: A boolean field on `AssessmentPeriod` that marks the active/default exam period.
- **MarksheetGrid**: The principal and teacher marksheet component at `/principal/assessments/marksheet` and `/teacher/assessments/marksheet`.
- **DashboardCharts**: The 8-4-4 analytics dashboard component at `/principal/assessments/dashboard` and `/teacher/assessments/dashboard`.
- **DeptAnalyticsPage**: The department analytics component at `/principal/assessments/dept-analytics` and `/teacher/assessments/dept-analytics`.
- **applicableForms**: An integer array on `Subject` that lists the form numbers for which a subject is available.

---

## Requirements

### Requirement 1: Cascading Filter Sequence

**User Story:** As a principal or teacher, I want the exam analysis filters to follow a fixed sequence (Period → Form → Stream → Subject), so that each selection meaningfully narrows down the next and I never see irrelevant options.

#### Acceptance Criteria

1. THE `ExamFilterBar` SHALL render filter controls in the order: Exam Period, Form, Stream, Subject.
2. WHEN a user has not yet selected an Exam Period, THE `ExamFilterBar` SHALL render the Form, Stream, and Subject controls in a disabled state.
3. WHEN a user has selected an Exam Period but has not yet selected a Form, THE `ExamFilterBar` SHALL render the Stream and Subject controls in a disabled state.
4. WHEN a user has selected a Form but has not yet selected a Stream, THE `ExamFilterBar` SHALL render the Subject control in a disabled state.
5. WHEN a user changes the Exam Period selection, THE `ExamFilterBar` SHALL reset the Form, Stream, and Subject selections to their unselected state.
6. WHEN a user changes the Form selection, THE `ExamFilterBar` SHALL reset the Stream and Subject selections to their unselected state.
7. WHEN a user changes the Stream selection, THE `ExamFilterBar` SHALL reset the Subject selection to its unselected state.

---

### Requirement 2: Exam Period Filter

**User Story:** As a principal or teacher, I want the period selector to automatically default to the current exam period, so that I can see the most relevant data immediately without manual selection.

#### Acceptance Criteria

1. WHEN the `ExamFilterBar` mounts, THE `ExamFilterBar` SHALL fetch available `AssessmentPeriod` records for the school from the `/api/assessments/periods` endpoint.
2. WHEN the periods API response contains a period with `isCurrent: true`, THE `ExamFilterBar` SHALL auto-select that period.
3. WHEN the periods API response contains no period with `isCurrent: true`, THE `ExamFilterBar` SHALL auto-select the first period in the response.
4. WHEN the periods API response contains exactly one period, THE `ExamFilterBar` SHALL auto-select it and render the Period control in a read-only or visually locked state.
5. WHILE periods are loading, THE `ExamFilterBar` SHALL render the Period control in a disabled state with a loading indicator.
6. IF the periods API request fails, THEN THE `ExamFilterBar` SHALL display an inline error message below the Period control.

---

### Requirement 3: Form Filter

**User Story:** As a principal or teacher, I want to select a year group (Form) after choosing a period, so that I can narrow the analysis to one cohort without caring about individual stream names at this step.

#### Acceptance Criteria

1. WHEN a user has selected an Exam Period, THE `ExamFilterBar` SHALL derive the available Form numbers by inspecting the `form` field of the `SchoolClass` records provided to the component via props.
2. THE `ExamFilterBar` SHALL render one option per distinct `form` integer found in the provided class list, labelled "Form N".
3. WHEN the derived list of available Forms contains exactly one form number, THE `ExamFilterBar` SHALL auto-select that form.
4. WHEN the derived list of available Forms contains more than one form number, THE `ExamFilterBar` SHALL render a placeholder option (e.g. "Select form") and not auto-select.
5. THE `ExamFilterBar` SHALL NOT require an API call to populate the Form dropdown; it SHALL derive options from the `classes` prop already passed to the component.

---

### Requirement 4: Stream Filter

**User Story:** As a principal or teacher, I want to see and select individual class streams after choosing a Form, so that I can drill down to a single class or view all streams of a form at once.

#### Acceptance Criteria

1. WHEN a user has selected a Form, THE `ExamFilterBar` SHALL populate the Stream dropdown with the `SchoolClass` records whose `form` field matches the selected Form number.
2. THE `ExamFilterBar` SHALL render each `SchoolClass` for the selected form as a selectable option, labelled with `SchoolClass.name`.
3. WHEN the filtered list of `SchoolClass` records for the selected form contains exactly one class, THE `ExamFilterBar` SHALL auto-select that class and MAY render the Stream control as hidden or read-only.
4. WHEN the filtered list of `SchoolClass` records for the selected form contains more than one class, THE `ExamFilterBar` SHALL render an "All streams" option as the first entry with an empty value, in addition to the individual class options.
5. WHEN the user selects "All streams", THE `ExamFilterBar` SHALL emit a `FilterSelection` with `classId` set to an empty string and `form` set to the selected form number.
6. THE `ExamFilterBar` SHALL NOT require an API call to populate the Stream dropdown; it SHALL derive options from the `classes` prop.

---

### Requirement 5: Subject Filter

**User Story:** As a principal or teacher, I want the subject list to show only subjects applicable to the selected form, so that I never see irrelevant subjects for the class I am analysing.

#### Acceptance Criteria

1. WHEN a user has selected a Stream (or "All streams"), THE `ExamFilterBar` SHALL filter the available subjects to those whose `applicableForms` array includes the currently selected Form number.
2. THE `ExamFilterBar` SHALL render each applicable subject as a selectable option, labelled with `subject.name`.
3. WHEN the filtered list of applicable subjects contains exactly one subject, THE `ExamFilterBar` SHALL auto-select it.
4. WHEN the filtered list of applicable subjects contains more than one subject, THE `ExamFilterBar` SHALL render a placeholder option (e.g. "Select subject") and not auto-select.
5. WHERE a consumer page does not require subject selection (e.g. DashboardCharts in multi-class mode), THE `ExamFilterBar` SHALL accept a `hideSubject` boolean prop that removes the Subject dropdown from the rendered output.
6. THE `ExamFilterBar` SHALL derive subject options from the `subjects` prop passed to the component; it SHALL NOT make an additional API call for subjects.

---

### Requirement 6: Selection Callback

**User Story:** As a developer integrating the ExamFilterBar, I want a typed callback that fires whenever the filter selection changes, so that my page component can react to new filter values without managing internal filter state.

#### Acceptance Criteria

1. THE `ExamFilterBar` SHALL accept an `onChange` prop of type `(selection: FilterSelection) => void`.
2. WHEN the Period, Form, Stream, and Subject selections all have non-empty values, THE `ExamFilterBar` SHALL invoke the `onChange` callback with the complete `FilterSelection` object.
3. WHEN the Subject filter is hidden via the `hideSubject` prop AND the Period, Form, and Stream selections all have non-empty values, THE `ExamFilterBar` SHALL invoke the `onChange` callback with a `FilterSelection` where `subjectId` is an empty string.
4. WHEN the user changes any upstream filter that resets a downstream selection, THE `ExamFilterBar` SHALL NOT invoke the `onChange` callback until the downstream selections are complete again.
5. THE `ExamFilterBar` SHALL invoke the `onChange` callback once immediately after auto-selections complete on mount, so that the consumer page can load its initial data without user interaction.

---

### Requirement 7: Auto-Selection Behaviour

**User Story:** As a user, I want sensible defaults applied automatically so that I arrive at a useful data view without clicking through every dropdown.

#### Acceptance Criteria

1. WHEN the `ExamFilterBar` mounts and exactly one option exists at each step of the chain, THE `ExamFilterBar` SHALL auto-select each step sequentially and invoke `onChange` once the full chain is resolved.
2. WHEN the periods load and a current period is identified, THE `ExamFilterBar` SHALL begin the auto-selection chain starting from that period.
3. WHEN a step in the chain yields more than one option, THE `ExamFilterBar` SHALL stop auto-selection at that step and wait for explicit user input.
4. WHEN auto-selection results in a complete `FilterSelection`, THE `ExamFilterBar` SHALL invoke the `onChange` callback exactly once for that auto-selected state.

---

### Requirement 8: Loading and Error States

**User Story:** As a user, I want clear visual feedback during data loading and on errors, so that I understand the system state and am not left waiting with no indication of progress.

#### Acceptance Criteria

1. WHILE the periods API request is in flight, THE `ExamFilterBar` SHALL render a visible loading indicator on the Period control.
2. WHEN the consumer page that owns `ExamFilterBar` fetches data in response to an `onChange` event, THE consumer page SHALL display a loading indicator within its data area, separate from the filter bar.
3. IF the periods API request fails, THEN THE `ExamFilterBar` SHALL display the error message inline near the Period control without unmounting other controls.
4. THE `ExamFilterBar` SHALL NOT display a full-page loading overlay; all loading states SHALL be scoped to the relevant control or data area.

---

### Requirement 9: UI Design Consistency

**User Story:** As a user, I want the filter bar to look and feel the same across all assessment pages, so that the interface is predictable and professional.

#### Acceptance Criteria

1. THE `ExamFilterBar` SHALL use `inputClass` from `@/components/ui` for all `<select>` elements.
2. THE `ExamFilterBar` SHALL use `labelClass` from `@/components/ui` for all `<label>` elements.
3. THE `ExamFilterBar` SHALL render the filter controls in a flex row using `flex flex-wrap items-end gap-4 mb-6` as the container class.
4. WHEN a control is disabled, THE `ExamFilterBar` SHALL apply the `disabled:opacity-50 disabled:cursor-not-allowed` visual treatment, which is already embedded in `inputClass`.
5. THE `ExamFilterBar` SHALL be accessible: each `<select>` SHALL have an associated `<label>` linked via matching `htmlFor` and `id` attributes.

---

### Requirement 10: MarksheetGrid Integration

**User Story:** As a developer, I want the MarksheetGrid component to use `ExamFilterBar` instead of its current ad-hoc filters, so that the marksheet page has the same period → form → stream → subject cascade as all other assessment pages.

#### Acceptance Criteria

1. THE `MarksheetGrid` component SHALL delegate filter rendering to `ExamFilterBar`, removing its own inline Period, Class, and Subject `<select>` elements.
2. WHEN `ExamFilterBar` invokes `onChange` with a complete `FilterSelection`, THE `MarksheetGrid` SHALL use the `periodId`, `classId`, and `subjectId` from that selection to fetch marksheet data from `/api/assessments/marksheet`.
3. THE `MarksheetGrid` SHALL continue to support the `lockClass` prop; WHEN `lockClass` is true AND only one class is available, THE `ExamFilterBar` SHALL auto-select it and MAY hide the Stream dropdown.
4. THE `MarksheetGrid` SHALL continue to support the `defaultClassId` and `defaultSubjectId` props; WHEN these are provided, THE `ExamFilterBar` SHALL use them as initial pre-selected values overriding auto-selection.

---

### Requirement 11: DashboardCharts Integration

**User Story:** As a developer, I want the DashboardCharts component to use `ExamFilterBar` with the standard filter chain, replacing the conflicting "Class" and "Form" selectors with the new cascading approach.

#### Acceptance Criteria

1. THE `DashboardCharts` component SHALL delegate filter rendering to `ExamFilterBar`, removing its own inline Period, Class, Subject, and Form `<select>` elements.
2. WHEN `ExamFilterBar` invokes `onChange`, THE `DashboardCharts` SHALL use `periodId`, `classId` (may be empty string for "All streams"), and `form` to fetch analytics data from `/api/assessments/dashboard`.
3. THE `DashboardCharts` component SHALL pass `hideSubject={false}` to `ExamFilterBar` so that subject filtering remains available.
4. WHEN the `ExamFilterBar` emits a `classId` of empty string (meaning "All streams"), THE `DashboardCharts` SHALL pass `form` (not `classId`) as the filter parameter to the analytics API, matching the existing API contract.

---

### Requirement 12: DeptAnalyticsPage Integration

**User Story:** As a developer, I want the DeptAnalyticsPage to add the form/stream/subject cascade after its existing Department and Period selectors, so that department analytics can be filtered to a specific class or subject.

#### Acceptance Criteria

1. THE `DeptAnalyticsPage` SHALL retain its Department selector (it is not part of the `ExamFilterBar` chain).
2. THE `DeptAnalyticsPage` SHALL replace its standalone Period selector with the Period step from `ExamFilterBar`, OR SHALL pass the period from its own selector to `ExamFilterBar` via a controlled prop.
3. WHEN `ExamFilterBar` invokes `onChange`, THE `DeptAnalyticsPage` SHALL use the `periodId`, `classId`, and `subjectId` from the selection to scope department analytics queries.
4. THE `DeptAnalyticsPage` SHALL accept a `hideSubject` prop forwarded to `ExamFilterBar` so that the subject step can be optionally omitted for pages that do not require it.

---

### Requirement 13: Teacher-Facing Pages

**User Story:** As a teacher, I want the same cascading filter experience as the principal, but scoped to only the classes and subjects I am assigned to, so that I see a focused and relevant filter set.

#### Acceptance Criteria

1. THE teacher `MarksheetPage` at `/teacher/assessments/marksheet` SHALL pass only the teacher's assigned `SchoolClass` records as the `classes` prop to `ExamFilterBar`, so that the Form and Stream dropdowns only show forms and streams the teacher teaches.
2. THE teacher `DashboardPage` at `/teacher/assessments/dashboard` SHALL pass only the teacher's assigned `SchoolClass` records to `ExamFilterBar`.
3. WHEN a teacher is a class teacher of exactly one class, THE `ExamFilterBar` SHALL auto-select through the Period → Form → Stream chain and land on the Subject step ready for selection.
4. WHERE a teacher has DIRECTOR or EXAM_OFFICER role, THE teacher-facing pages SHALL pass all school classes to `ExamFilterBar`, not only the teacher's assigned classes.
