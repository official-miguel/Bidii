# Requirements Document

## Introduction

This feature implements full role-based access control (RBAC) and visibility rules across the school-management system (Next.js 14 App Router, Prisma, PostgreSQL). The governing principle is absolute: if a role cannot view or manage something, that thing must not render at all — no greyed-out buttons, no disabled tabs, no visible-but-blocked navigation items, and no API responses that leak data the caller cannot act on. Hidden means absent from the DOM, absent from the sidebar/tab list, and absent from the API response.

The work spans nine requirements: fixing the broken `requirePermission()` path for teachers (R1), building a five-source effective-permissions resolver for teacher roles (R2), the People hub with per-assignment tiles and an elective "Add Students" modal (R3), students-list default class filter and edit hard-scoping (R4), trimmed staff directory for plain subject teachers (R5), the "My Subjects" tab in Exams & Analysis (R6), the "My Department" tab for HODs (R7), a read-only "View" tab in Attendance (R8), and full sidebar/tab wiring from the resolver output (R9).

## Glossary

- **Permission_Resolver**: The function `getTeacherEffectivePermissions(user)` that computes a teacher's full `EffectivePermissions` object as the union of five independent sources.
- **Derived_Role**: A capability automatically computed from operational assignments (e.g. `ClassSubjectTeacher`, `Department.headTeacherId`) — not stored as a role record.
- **Assigned_Role**: A `StaffRole` granted via `UserStaffRole` or `User.staffRoleId`.
- **mergeAccess**: The existing OR-merge function in `src/lib/permissions.ts` that combines two `ModuleAccess` objects by taking the union of every flag.
- **TEACHER_User**: A `User` row whose `role` field equals `"TEACHER"`.
- **Plain_Subject_Teacher**: A TEACHER_User who holds zero `UserStaffRole` / `StaffRole` assignments (no Assigned_Role).
- **Subject_Teacher_Scope**: Permissions derived from `ClassSubjectTeacher` rows and/or `ElectiveGroupTeacher` / `ClassElectiveGroupTeacher` rows for a teacher.
- **Class_Teacher_Scope**: Permissions derived from `SchoolClass.classTeacherId === teacher.id`.
- **HOD_Scope**: Permissions derived from `Department.headTeacherId === teacher.id`.
- **Dorm_Master_Scope**: Permissions derived from `Dormitory.boardingMasterId === teacher.id`.
- **Baseline_Grant**: Permissions every TEACHER_User receives unconditionally, with no assignment required.
- **EffectivePermissions**: The `Partial<Record<Module, ModuleAccess>>` type defined in `src/lib/permissions.ts`.
- **getVisibleHubs**: The existing function that converts an `EffectivePermissions` object into a `Set<NavHub>` for the sidebar.
- **computeDerivedRoles**: The existing function in `src/lib/derivedRoles.ts` that queries and returns all active `DerivedRole` objects for a teacher.
- **TEACHER_BASE_HUBS**: The constant in `src/app/teacher/layout.tsx` that currently shows all hubs unconditionally for teachers.
- **AttendanceView**: The existing React component used by the teacher attendance page.
- **StudentElective**: The Prisma model recording a student's enrollment in an elective subject.
- **ClassSubjectTeacher**: The Prisma model recording a teacher's standing assignment to a (class, subject) pair.
- **ElectiveGroupTeacher**: The Prisma model recording a teacher–subject pairing within an elective group (form-wide).
- **ClassElectiveGroupTeacher**: The Prisma model recording a teacher–subject pairing within an elective group scoped to a specific class.
- **API_Layer**: The Next.js Route Handler files under `src/app/api/`.
- **DOM_Absent**: An element that is not rendered to the HTML at all (not `display:none`, not `aria-hidden`, not `disabled`).

---

## Requirements

### Requirement 1: Fix `requirePermission()` for TEACHER Users

**User Story:** As a system, I want every API route using `requirePermission()` to correctly resolve TEACHER access through a single unified code path, so that ad-hoc fallbacks that bypass the permission system are eliminated.

#### Acceptance Criteria

1. WHEN a TEACHER_User calls `requirePermission(module, action)`, THE Permission_Resolver SHALL evaluate that teacher's full effective permissions (via `getTeacherEffectivePermissions()`) and return the User object if the requested action is permitted, or null otherwise.
2. THE `requirePermission()` function SHALL NOT fall through to returning `null` for TEACHER_User callers without consulting the Permission_Resolver.
3. WHEN `src/app/api/attendance/route.ts` calls `requireAttendanceAccess()`, THE Attendance_Route SHALL resolve teacher access through `requirePermission("ATTENDANCE", action)` backed by the Permission_Resolver — the `?? requireRole("TEACHER")` ad-hoc fallback pattern SHALL be removed.
4. THE Permission_Resolver SHALL be the single code path for all three roles (PRINCIPAL, ADMIN_STAFF, TEACHER) — no role-specific ad-hoc fallbacks shall remain in any API route that currently uses them.
5. WHEN a PRINCIPAL calls `requirePermission(module, action)`, THE Permission_Resolver SHALL return the User unconditionally for all modules and actions (existing behaviour preserved).
6. WHEN an ADMIN_STAFF user calls `requirePermission(module, action)`, THE Permission_Resolver SHALL return the User only when the assigned StaffRole grants the requested action (existing behaviour preserved).

---

### Requirement 2: Teacher Effective Permissions Resolver (Five Stackable Sources)

**User Story:** As a TEACHER_User, I want my access permissions to be automatically computed from my actual operational assignments, so that I see exactly the modules and actions I need without manual configuration by the Principal.

#### Acceptance Criteria

1. THE Permission_Resolver SHALL implement `getTeacherEffectivePermissions(user: User): Promise<EffectivePermissions>` that returns the union of five independent permission sources using `mergeAccess()`.

2. THE Permission_Resolver SHALL apply Source 1 (Baseline_Grant) unconditionally for every TEACHER_User, granting:
   - `RECORDS_DISCIPLINE.canView = true` (scoped to own class or taught students at the API layer)
   - `RECORDS_ACHIEVEMENTS.canView = true` (same API-layer scope)
   - `RECORDS_DISCIPLINE.canCreate = true` (unscoped — any student)
   - `RECORDS_ACHIEVEMENTS.canCreate = true` (unscoped)
   - `ATTENDANCE.canView = true` (scoped at the API layer to classes they teach or are class teacher of)

3. WHEN a TEACHER_User has one or more `ClassSubjectTeacher` rows OR one or more `ElectiveGroupTeacher` / `ClassElectiveGroupTeacher` rows, THE Permission_Resolver SHALL apply Source 2 (Subject_Teacher_Scope), granting:
   - `ASSESSMENTS.canView = true`, `canCreate = true`, `canEdit = true` (scoped at the API layer to their class/subject combinations)
   - `STUDENTS.canView = true` (unscoped — for profile access and search)

4. WHEN `SchoolClass.classTeacherId === teacher.id` for any class in the school, THE Permission_Resolver SHALL apply Source 3 (Class_Teacher_Scope), granting:
   - `STUDENTS.canEdit = true` (API-layer enforced: only students where `student.classId === theirClassId`)
   - `STUDENTS.canView = true` (unscoped)
   - `ATTENDANCE.canView = true` (scoped to their class only)
   - `ATTENDANCE.canCreate = true` (scoped to their class only)

5. WHEN `Department.headTeacherId === teacher.id` for any department in the school, THE Permission_Resolver SHALL apply Source 4 (HOD_Scope), granting:
   - `ASSESSMENT_FRAMEWORK.canConfigure = true` (API-layer enforced: only `Paper` rows whose `subjectId` belongs to that department's subjects)
   - `ANALYTICS.canView = true` (scoped: "My Department" tab only)

6. WHEN `Dormitory.boardingMasterId === teacher.id` for any dormitory in the school, THE Permission_Resolver SHALL apply Source 5 (Dorm_Master_Scope), granting:
   - `ACCOMMODATION.canView = true` (unscoped)
   - `ACCOMMODATION.canEdit = true` (API-layer enforced: only the specific dormitory where `boardingMasterId === teacher.id`)
   - `ACCOMMODATION.canManage` SHALL remain `false` for a plain Dorm_Master (no Assigned_Role)

7. WHEN a TEACHER_User also holds an Assigned_Role (via `UserStaffRole`), THE Permission_Resolver SHALL union-merge the Assigned_Role permissions with the derived permissions so that neither source reduces what the other grants.
8. WHEN a TEACHER_User holds both Dorm_Master_Scope AND an Assigned_Role whose StaffRole grants `ACCOMMODATION.canManage = true`, THE merged result SHALL have `ACCOMMODATION.canManage = true`.
9. WHEN `getEffectivePermissions(user)` is called for a TEACHER_User, THE `getEffectivePermissions` function SHALL call `getTeacherEffectivePermissions(user)` instead of returning `{}`.

**Correctness Properties:**

- FOR ALL TEACHER_Users, the result of `getTeacherEffectivePermissions(user)` SHALL contain at minimum all permissions granted by the Baseline_Grant (Source 1).
- FOR ALL TEACHER_Users with at least one ClassSubjectTeacher or elective teacher row, `STUDENTS.canView` SHALL be `true` in the resolved permissions.
- FOR ALL TEACHER_Users with no ClassSubjectTeacher, no elective teacher row, no classTeacherOf, no departmentHeadOf, and no dormsBoardingMaster, the resolved permissions SHALL equal exactly the Baseline_Grant — no more, no less.
- FOR ALL pairs of permission sources A and B, `mergeAccess(A, B)` SHALL produce a result where every flag is `true` if and only if it is `true` in at least one of A or B (union semantics).

---

### Requirement 3: People Page — Subject/Class Assignment Tiles

**User Story:** As a TEACHER_User, I want a People hub page that shows tiles for each of my teaching assignments, so that I can quickly navigate to the students and tools relevant to each class I teach.

#### Acceptance Criteria

1. WHEN a TEACHER_User visits the People hub (e.g. `/teacher/people`), THE People_Page SHALL render one tile per `ClassSubjectTeacher` row where `teacherId === teacher.id`, displaying "SubjectName — ClassName" (e.g. "English — 4X").
2. WHEN a TEACHER_User has `ElectiveGroupTeacher` or `ClassElectiveGroupTeacher` rows, THE People_Page SHALL render one tile per elective assignment, displaying the elective subject name and class or group name.
3. WHEN a TEACHER_User is a class teacher (`SchoolClass.classTeacherId === teacher.id`), THE People_Page SHALL pin the Class_Teacher tile first in the tile list, before all other tiles.
4. WHEN a TEACHER_User has zero `ClassSubjectTeacher` rows and zero elective teacher rows, THE People_Page SHALL render an empty state message — no tiles are shown.
5. WHEN an elective tile is rendered, THE People_Page SHALL display an "Add Students" action button on or adjacent to that tile.
6. WHEN a TEACHER_User clicks the "Add Students" button on an elective tile, THE Add_Students_Modal SHALL open, listing all students currently enrolled in the tile's class who are not yet enrolled in `StudentElective` for that elective subject, with a checkbox next to each student.
7. WHEN a TEACHER_User selects one or more students in the Add_Students_Modal and confirms, THE Add_Students_Modal SHALL submit a POST request that creates `StudentElective` rows for each selected student and that elective subject.
8. IF a POST to create `StudentElective` rows fails for any selected student, THEN THE Add_Students_Modal SHALL display a descriptive error message and SHALL NOT close until the error is acknowledged.
9. WHEN the Add_Students_Modal POST succeeds, THE Add_Students_Modal SHALL close and the tile's student count SHALL update to reflect the newly enrolled students without a full page reload.
10. THE "Add Students" button SHALL be DOM_Absent for non-elective (core subject) tiles — it must not render at all.

---

### Requirement 4: Students Section Default Filter and Edit Hard-Scoping

**User Story:** As a TEACHER_User who is a class teacher, I want the Students list to default to my own class, so that I can quickly manage my students without manually filtering every time.

#### Acceptance Criteria

1. WHEN a TEACHER_User with a `classTeacherOf` assignment visits `/teacher/students`, THE Students_Page SHALL initialise the class filter to that teacher's `classTeacherOf.id` so that only students from their own class are displayed by default.
2. WHEN a TEACHER_User without a `classTeacherOf` assignment visits `/teacher/students`, THE Students_Page SHALL display students from all classes by default (no class filter applied).
3. WHEN a TEACHER_User performs a text search (by name or admission number) on the Students_Page, THE search SHALL query across all classes regardless of the active class filter — results may span all classes.
4. WHEN a TEACHER_User navigates to `/teacher/students/[id]`, THE Student_Profile_Page SHALL be accessible for any student regardless of the teacher's class assignment.
5. WHEN a TEACHER_User who is a class teacher views a student whose `classId === teacher.classTeacherOf.id`, THE Students_Page SHALL render the edit action for that student row.
6. WHEN a TEACHER_User views a student whose `classId !== teacher.classTeacherOf.id` (or the teacher has no `classTeacherOf`), THE edit action button SHALL be DOM_Absent — it must not render at all.
7. WHEN a TEACHER_User sends a PUT or PATCH request to `/api/students/[id]` and the student's `classId !== teacher.classTeacherOf.id`, THE API_Layer SHALL return HTTP 403.
8. WHEN a TEACHER_User sends a PUT or PATCH request to `/api/students/[id]` and the teacher has no `classTeacherOf` assignment, THE API_Layer SHALL return HTTP 403.

---

### Requirement 5: Trimmed Staff Directory for Plain Subject Teachers

**User Story:** As a Plain_Subject_Teacher, I want to access a staff directory that shows colleague names and designations, so that I can identify who to contact — without exposing private contact details I have no need to see.

#### Acceptance Criteria

1. WHEN a Plain_Subject_Teacher calls `GET /api/staff`, THE API_Layer SHALL return a response where each staff record contains only: `id`, `fullName`, `designation`, `primaryDepartment.name`, `staffId` — no other fields.
2. THE trimmed response SHALL be produced by the API route conditionally based on the caller's resolved permissions — it SHALL NOT be produced by client-side field filtering.
3. WHEN a Plain_Subject_Teacher calls `GET /api/staff/[id]`, THE API_Layer SHALL return HTTP 403.
4. THE `email`, `phone`, and any other contact fields SHALL be absent from the API response body for a Plain_Subject_Teacher caller — not null, not empty string, but absent from the JSON object entirely.
5. WHEN a PRINCIPAL calls `GET /api/staff` or `GET /api/staff/[id]`, THE API_Layer SHALL return the full staff record (existing behaviour preserved).
6. WHEN an ADMIN_STAFF user with `STAFF.canView = true` calls `GET /api/staff`, THE API_Layer SHALL return the full staff record (existing behaviour preserved).
7. WHEN a TEACHER_User who holds an Assigned_Role that grants `STAFF.canView = true` calls `GET /api/staff`, THE API_Layer SHALL return the full staff record.

---

### Requirement 6: Exams & Analysis — "My Subjects" Tab

**User Story:** As a Subject_Teacher, I want a "My Subjects" tab in the Exams & Analysis area, so that I can directly access results entry and performance data for only the subjects I teach — without seeing the full school view I am not authorised to manage.

#### Acceptance Criteria

1. WHEN a TEACHER_User with at least one `ClassSubjectTeacher` or elective teacher row visits the Exams & Analysis page, THE Exams_Analysis_Page SHALL render a "My Subjects" tab.
2. THE "My Subjects" tab SHALL be the default selected tab for any TEACHER_User who qualifies to see it.
3. WHEN the "My Subjects" tab is active, THE tab content SHALL list only the (subject, class) combinations from the teacher's `ClassSubjectTeacher` and elective teacher rows.
4. WHEN a TEACHER_User drills into a subject-class combination, THE drill-down view SHALL show only students the teacher teaches in that specific class/subject combination.
5. WHEN a TEACHER_User drills into a student row within a subject-class combination, THE student detail view SHALL show that student's performance data for that one subject only — not their full profile or scores for other subjects.
6. WHEN a TEACHER_User has zero `ClassSubjectTeacher` and zero elective teacher rows, THE "My Subjects" tab SHALL be DOM_Absent — it must not render at all.
7. THE existing "Overview" tab (full school view) SHALL remain untouched and visible only to users who already have access to it (Principal, Admin_Staff with ASSESSMENTS permission).

---

### Requirement 7: Exams & Analysis — "My Department" Tab (HOD Only)

**User Story:** As a Head of Department (HOD), I want a "My Department" tab in the Exams & Analysis area, so that I can review analytics for all subjects and students within my department without seeing unrelated departmental data.

#### Acceptance Criteria

1. WHEN a TEACHER_User whose `departmentHeadOf` is non-null visits the Exams & Analysis page, THE Exams_Analysis_Page SHALL render a "My Department" tab.
2. WHEN the "My Department" tab is active, THE tab content SHALL display analytics scoped to the subjects belonging to the department where `Department.headTeacherId === teacher.id`.
3. WHEN the "My Department" tab is active, THE tab content SHALL show data for all classes and students who are enrolled in any of the department's subjects.
4. WHEN a HOD teacher also has `ClassSubjectTeacher` rows, THE Exams_Analysis_Page SHALL render both the "My Subjects" tab and the "My Department" tab for that teacher.
5. WHEN a TEACHER_User whose `departmentHeadOf` is null visits the Exams & Analysis page, THE "My Department" tab SHALL be DOM_Absent — it must not render at all.
6. THE "My Department" tab content SHALL mirror the filter layout of the Principal dashboard scoped to the HOD's department subjects — it SHALL NOT expose data for subjects outside their department.

---

### Requirement 8: Attendance Module — Read-Only "View" Tab

**User Story:** As a TEACHER_User, I want a "View" tab on the Attendance page that shows attendance data for every class I teach, so that I can review attendance trends across my assigned classes even if I am not the class teacher.

#### Acceptance Criteria

1. WHEN a TEACHER_User with at least one `ClassSubjectTeacher` or `ClassElectiveGroupTeacher` row visits the Attendance page, THE Attendance_Page SHALL render a "View" tab alongside the existing "Submit" tab.
2. WHEN a TEACHER_User who is a class teacher (but has no subject teacher rows) visits the Attendance page, THE Attendance_Page SHALL still render the "View" tab because the class teacher's own class counts as a "class they teach."
3. THE existing "Submit" tab behaviour SHALL be unchanged — it remains visible only to class teachers and submits the daily register for their own class.
4. WHEN the "View" tab is active, THE tab content SHALL display one tile per class, sourced from: `ClassSubjectTeacher` rows for the teacher, `ClassElectiveGroupTeacher` rows for the teacher, and (if applicable) the teacher's own class teacher assignment (pinned first).
5. WHEN a TEACHER_User clicks a class tile in the "View" tab, THE Attendance_Page SHALL show a present/absent list for the class on a teacher-selectable date.
6. WHEN a TEACHER_User selects a date range in the "View" tab detail view, THE Attendance_Page SHALL show a trend analysis chart derived from the existing `Attendance` model for that class and date range.
7. THE "View" tab data SHALL be read-only — no create, edit, or delete actions SHALL be available within this tab.
8. THE "View" tab SHALL consume data exclusively from existing `Attendance` model records (`studentId`, `classId`, `date`, `status`) — no schema changes are required.
9. WHEN a TEACHER_User has zero `ClassSubjectTeacher` rows, zero `ClassElectiveGroupTeacher` rows, and no `classTeacherOf` assignment, THE "View" tab SHALL be DOM_Absent.

---

### Requirement 9: Sidebar/Tab Visibility Wiring from Resolver Output

**User Story:** As a TEACHER_User, I want the sidebar and all page tabs to show only the hubs and tabs I am authorised to access, so that I am never presented with navigation items that lead to pages or data I cannot use.

#### Acceptance Criteria

1. WHEN the teacher layout (`src/app/teacher/layout.tsx`) loads, THE Layout SHALL call `getTeacherEffectivePermissions(user)` to obtain the teacher's full resolved permissions, and pass the resulting hub set to `DashboardShell` as `visibleHubs`.
2. THE `TEACHER_BASE_HUBS` constant fallback that shows all hubs unconditionally SHALL be replaced by the resolver output — teachers with no subject or class assignments SHALL see only the hubs their Baseline_Grant unlocks.
3. WHEN `getVisibleHubs(perms)` is called with a teacher's resolved permissions, THE function SHALL produce a `Set<NavHub>` containing exactly the hubs that correspond to modules where `canView` (or `canManage`) is `true`.
4. WHEN a TEACHER_User has at least one `ClassSubjectTeacher` or elective teacher row, THE sidebar SHALL include the "academic" hub (to expose Exams & Analysis, My Subjects, etc.).
5. WHEN a TEACHER_User has a `classTeacherOf` assignment, THE sidebar SHALL include access to the Attendance hub.
6. WHEN a TEACHER_User has neither a `classTeacherOf` assignment nor any `ClassSubjectTeacher` rows nor any elective teacher rows, THE sidebar SHALL NOT show the Attendance hub link.
7. WHEN tabs within pages (My Subjects, My Department, View tab in Attendance) are evaluated for render, THE page component SHALL check derived role flags from `computeDerivedRoles()` — if the required flag is not set, the tab element SHALL be DOM_Absent (not disabled, not hidden, not grayed-out).
8. THE People page tiles SHALL always be shown for any TEACHER_User who has at least one subject or elective teaching assignment, since every such teacher holds the Subject_Teacher_Scope.
9. WHEN the `DashboardShell` receives a `visibleHubs` set, THE sidebar SHALL render only navigation items whose hub ID is present in that set — items for absent hubs SHALL be DOM_Absent.

---

### Requirement 10: Timetable Admin Access Control

**User Story:** As an ADMIN_STAFF user with TIMETABLE management permissions, I want to access the full timetable admin view (Overview, Generate, Builder, Settings), so that I can perform timetable management without requiring a PRINCIPAL account.

#### Acceptance Criteria

1. WHEN a PRINCIPAL visits `/principal/timetable`, THE timetable admin pages SHALL be accessible (existing behaviour preserved).
2. WHEN an ADMIN_STAFF user whose effective permissions show `TIMETABLE.canManage === true` OR `TIMETABLE.canConfigure === true` visits `/staff/timetable`, THE full timetable admin view SHALL be accessible — Overview, Generate, Builder, and Settings pages.
3. WHEN an ADMIN_STAFF user WITHOUT `TIMETABLE.canManage` or `TIMETABLE.canConfigure` clicks the Timetable link in the Academic hub, THE link SHALL route them to a read-only personal timetable view (equivalent to `/teacher/timetable`) — the admin Generate/Builder/Settings controls SHALL be DOM_Absent.
4. WHEN a plain TEACHER_User clicks the Timetable link, THE behaviour SHALL remain exactly as today — routes to `/teacher/timetable`, personal lesson schedule only — DO NOT change this path.
5. THE Academic hub in `HubSidebar.tsx` SHALL remain visible to any ADMIN_STAFF user who has canView access to ANY academic-hub module (Classes, Subjects, Attendance, Assessments, etc.) — the hub must not be hidden solely because the user lacks timetable-manage rights.
6. THE `/staff/timetable` admin pages (Overview, Generate, Builder, Settings) SHALL reuse the existing `/principal/timetable` components/logic — no duplication of page component business logic.
7. THE `TIMETABLE_NAV` items used within the staff timetable admin pages SHALL point to `/staff/timetable/...` paths, not `/principal/timetable/...` paths.
8. THE `src/app/principal/layout.tsx` SHALL continue to gate on `user.role !== "PRINCIPAL"` — no change to that layout.
9. AFTER all changes, running `npx tsc --noEmit` and a full Next.js build SHALL produce zero errors.
10. THE four caller profiles below SHALL each land on the correct view with no admin controls leaking to the last two:
    - PRINCIPAL → `/principal/timetable` admin view ✓
    - ADMIN_STAFF with `TIMETABLE.canManage` → `/staff/timetable` admin view ✓
    - ADMIN_STAFF without timetable-manage rights → read-only personal view ✓
    - TEACHER → `/teacher/timetable` personal schedule (unchanged) ✓
