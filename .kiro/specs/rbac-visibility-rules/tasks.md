# Implementation Plan: RBAC Visibility Rules

## Overview

This implementation plan converts the RBAC visibility rules feature design into a series of incremental coding tasks. The approach follows the implementation order specified in requirements: resolver first (with TypeScript validation), then UI wiring, then feature-specific pages. Each task builds on previous work to ensure no orphaned code and complete integration.

## Tasks

- [x] 1. Fix `requirePermission()` Function for TEACHER Users
  - Modify `src/lib/permissions.ts` to remove the early `null` return for TEACHER users  
  - Add TEACHER case that calls the new `getTeacherEffectivePermissions()` function
  - Update `getEffectivePermissions()` to delegate TEACHER users to the new resolver
  - _Requirements: R1_

- [x] 2. Implement Five-Source Teacher Permission Resolver
  - [x] 2.1 Create core `getTeacherEffectivePermissions()` function
    - Implement the five-source resolver logic in `src/lib/permissions.ts`
    - Define permission source interfaces and constants
    - Implement baseline grant permissions (Source 1)
    - Query teacher assignments and apply conditional sources (Sources 2-6)
    - Use existing `mergeAccess()` for union merge of all sources
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7, R2.8, R2.9_

  - [ ]* 2.2 Write property test for permission resolver
    - **Property 1: Union semantics - permissions only increase**
    - **Validates: Requirements R2.7**

  - [x] 2.3 Create teacher permission cache layer
    - Implement `TeacherPermissionCache` class in `src/lib/teacherPermissionCache.ts`
    - Add 5-minute TTL caching to avoid repeated DB queries within request cycle
    - Integrate cache into `getTeacherEffectivePermissions()`
    - _Requirements: R2_

  - [ ]* 2.4 Write unit tests for teacher permission cache
    - Test cache hit/miss scenarios
    - Test TTL expiration and cleanup
    - _Requirements: R2_

- [x] 3. Update API Routes to Use Unified Permission System
  - [x] 3.1 Remove ad-hoc TEACHER fallbacks from API routes
    - Update `/api/attendance/route.ts` to remove `?? requireRole("TEACHER")` patterns
    - Ensure all API routes use `requirePermission()` consistently
    - _Requirements: R1.3, R1.4_

  - [x] 3.2 Verify TypeScript compilation and full build
    - Run `npx tsc --noEmit` to ensure no TypeScript errors
    - Run full Next.js build to verify all routes compile correctly
    - _Requirements: R1_

- [x] 4. Checkpoint - Core Resolver Validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement People Hub Page with Assignment Tiles
  - [x] 5.1 Create People page component
    - Create `src/app/teacher/people/page.tsx` with assignment tile layout
    - Query teacher assignments from database (ClassSubjectTeacher, electives, class teacher)
    - Render tiles with proper titles ("English — 4X", "Class Teacher — 3 North")
    - Pin class teacher tile first if present
    - _Requirements: R3.1, R3.2, R3.3, R3.4_

  - [x] 5.2 Create Add Students Modal for elective tiles
    - Create `src/components/teacher/AddStudentsModal.tsx`
    - List unassigned students with checkboxes
    - Handle multi-select and API submission
    - Show "Add Students" button only on elective tiles (DOM absent for core subjects)
    - _Requirements: R3.5, R3.6, R3.7, R3.8, R3.9, R3.10_

  - [ ]* 5.3 Write unit tests for People page components
    - Test tile rendering with different assignment combinations
    - Test Add Students modal functionality
    - _Requirements: R3_

- [x] 6. Enhance Students Page with Class Filter and Edit Scoping
  - [x] 6.1 Add default class filter for class teachers
    - Modify `src/app/teacher/students/page.tsx` to set default filter
    - Initialize filter to teacher's `classTeacherOf.id` when applicable
    - Preserve unrestricted search across all classes
    - _Requirements: R4.1, R4.2, R4.3, R4.4_

  - [x] 6.2 Implement edit action hard-scoping
    - Show edit buttons only for students in teacher's own class
    - Make edit buttons DOM absent for unauthorized students
    - Add API-layer enforcement in `/api/students/[id]` routes
    - Return HTTP 403 for unauthorized edit attempts
    - _Requirements: R4.5, R4.6, R4.7, R4.8_

  - [ ]* 6.3 Write integration tests for Students page scoping
    - Test default filter behavior
    - Test edit authorization enforcement
    - _Requirements: R4_

- [x] 7. Implement Trimmed Staff Directory Response
  - [x] 7.1 Add conditional response trimming to staff API
    - Modify `src/app/api/staff/route.ts` to check caller permissions
    - Return trimmed response for Plain Subject Teachers (id, fullName, designation, primaryDepartment.name, staffId only)
    - Preserve full response for authorized users (Principal, Admin Staff, Teachers with STAFF permissions)
    - Block individual staff record access (`/api/staff/[id]`) for Plain Subject Teachers
    - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7_

  - [ ]* 7.2 Write unit tests for staff directory trimming
    - Test conditional response formatting
    - Test authorization checks
    - _Requirements: R5_

- [x] 8. Create Exams & Analysis Tab Structure
  - [x] 8.1 Implement "My Subjects" tab
    - Modify `src/app/teacher/assessments/page.tsx` to add tab structure
    - Add "My Subjects" tab for teachers with ClassSubjectTeacher or elective rows
    - Scope data to teacher's subject/class combinations
    - Make tab DOM absent when teacher has no subject assignments
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7_

  - [x] 8.2 Implement "My Department" tab for HODs
    - Add "My Department" tab for teachers with `departmentHeadOf` assignment
    - Scope analytics to department's subjects and students
    - Support both "My Subjects" and "My Department" tabs for HOD teachers with subject assignments
    - Make tab DOM absent when teacher is not HOD
    - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

  - [ ]* 8.3 Write unit tests for Exams & Analysis tabs
    - Test tab visibility logic
    - Test data scoping for different teacher types
    - _Requirements: R6, R7_

- [x] 9. Enhance Attendance Page with View Tab
  - [x] 9.1 Add "View" tab to Attendance page
    - Modify `src/app/teacher/attendance/page.tsx` to add read-only "View" tab
    - Show class tiles from teacher's assignments (ClassSubjectTeacher, ClassElectiveGroupTeacher, class teacher)
    - Implement date selection and trend analysis
    - Preserve existing "Submit" tab functionality
    - Make "View" tab DOM absent when teacher has no class assignments
    - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6, R8.7, R8.8, R8.9_

  - [ ]* 9.2 Write unit tests for Attendance View tab
    - Test class tile generation
    - Test read-only behavior
    - _Requirements: R8_

- [x] 10. Wire Sidebar and Tab Visibility from Resolver
  - [x] 10.1 Update teacher layout with resolver-based navigation
    - Modify `src/app/teacher/layout.tsx` to call `getTeacherEffectivePermissions()`
    - Replace `TEACHER_BASE_HUBS` constant with resolver output
    - Pass resolved hub set to `DashboardShell` as `visibleHubs`
    - _Requirements: R9.1, R9.2, R9.3_

  - [x] 10.2 Implement hub visibility logic
    - Ensure Academic hub shows for teachers with subject assignments
    - Ensure Attendance hub shows for class teachers
    - Hide Attendance hub for teachers without class assignments
    - Make unauthorized navigation items DOM absent (not disabled/hidden)
    - _Requirements: R9.4, R9.5, R9.6, R9.7, R9.8, R9.9_

  - [ ]* 10.3 Write integration tests for navigation visibility
    - Test sidebar hub filtering
    - Test tab visibility within pages
    - _Requirements: R9_

- [x] 11. Final Validation and Integration Testing
  - [x] 11.1 Run comprehensive build verification
    - Execute `npx tsc --noEmit` for final TypeScript validation
    - Run full Next.js production build
    - Verify all new API routes and components compile correctly
    - _Requirements: All_

  - [x] 11.2 Test permission resolver with different teacher profiles
    - Test Plain Subject Teacher (baseline permissions only)
    - Test Class Teacher (baseline + class teacher scope)
    - Test HOD (baseline + subject + HOD scope)
    - Test combined assignments (multiple sources active)
    - _Requirements: R2_

  - [ ]* 11.3 Write end-to-end property tests
    - **Property 2: Baseline permissions always present**
    - **Validates: Requirements R2.1**
    - **Property 3: Union merge correctness**
    - **Validates: Requirements R2.7**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Timetable Admin Access Control
  - [x] 13.1 Make `TIMETABLE_NAV` dynamic with `basePath` parameter
    - Refactor `src/lib/timetable/navItems.ts` to export `getTimetableNav(basePath: string)` returning nav items with dynamic paths
    - Keep a `TIMETABLE_NAV` constant (using `/principal/timetable` as basePath) for backward compatibility
    - _Requirements: R10.6, R10.7_

  - [x] 13.2 Add `basePath` prop to timetable page components
    - Modify the timetable Overview, Generate, Builder, Settings page components to accept a `basePath: string` prop
    - Replace all hardcoded `/principal/timetable/...` hrefs inside those components with `${basePath}/...`
    - Use `getTimetableNav(basePath)` instead of `TIMETABLE_NAV` constant in those components
    - _Requirements: R10.6_

  - [x] 13.3 Create `/staff/timetable` route tree
    - Create `src/app/staff/timetable/layout.tsx` — guards access: redirect to read-only if neither `TIMETABLE.canManage` nor `TIMETABLE.canConfigure`
    - Create `src/app/staff/timetable/page.tsx` — renders the timetable Overview component with `basePath="/staff/timetable"`
    - Create `src/app/staff/timetable/generate/page.tsx` — renders Generate component with `basePath="/staff/timetable"`
    - Create `src/app/staff/timetable/builder/page.tsx` — renders Builder component with `basePath="/staff/timetable"`
    - Create `src/app/staff/timetable/settings/page.tsx` — renders Settings component with `basePath="/staff/timetable"`
    - Create sub-pages for template, requirements, preferences, versions under `/staff/timetable/` matching the principal tree
    - _Requirements: R10.2, R10.6, R10.7_

  - [x] 13.4 Route Academic hub timetable link for ADMIN_STAFF
    - In `src/app/staff/academics/page.tsx` (or the equivalent context navigation), compute `hasTimetableAdmin` from effective permissions
    - Set timetable link href to `/staff/timetable` when `hasTimetableAdmin`, else to `/teacher/timetable` for read-only personal view
    - Make admin timetable cards (Generate, Builder) DOM_Absent when user lacks manage/configure rights
    - _Requirements: R10.3, R10.5_

  - [x] 13.5 Verify TypeScript and build
    - Run `npx tsc --noEmit` — zero errors required
    - Confirm the four caller profiles land on correct views
    - _Requirements: R10.9, R10.10_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Implementation follows strict order: resolver first, then API layer, then UI components
- TypeScript compilation validation occurs at multiple checkpoints
- DOM absence is enforced throughout - no disabled/hidden elements
- All permission checks are enforced at API layer, not just UI layer
- The five-source resolver enables automatic teacher permissions without manual configuration

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["5.1", "6.1", "7.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "6.3", "7.2"] },
    { "id": 6, "tasks": ["8.1", "9.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.2"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3"] },
    { "id": 12, "tasks": ["13.1"] },
    { "id": 13, "tasks": ["13.2"] },
    { "id": 14, "tasks": ["13.3", "13.4"] },
    { "id": 15, "tasks": ["13.5"] }
  ]
}
```