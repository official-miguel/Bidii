# Implementation Plan: Offline Performance Optimization

## Overview

Tasks are ordered by user-visible impact: data bugs first (silent data loss), then correctness fixes (hydration), then performance. Each task is a discrete, testable coding step. All implementation targets TypeScript/React unless noted.

---

## Tasks

- [x] 1. Fix attendance date normalisation bug
  - Add a `normDate(raw: string): string` utility function in `src/lib/offline/attendanceUtils.ts` that slices any ISO string to the first 10 characters (`raw.slice(0, 10)`), returning a `"YYYY-MM-DD"` string. Handle edge cases: already-normalised input returns unchanged.
  - Apply `normDate` to every `date` field before any `dbPut("attendance", ...)` call in `attendanceStore.ts` — in `upsert()`, `upsertMany()`, and `merge()`.
  - Apply `normDate` to each attendance row's `date` field in `syncEngine.ts` inside `mergeRows("attendance", rows)` before passing rows to `attendanceStore.merge()`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.1 Write property test for normDate idempotence and format
    - Use **fast-check** to generate arbitrary strings containing ISO datetimes and verify `normDate(normDate(x)) === normDate(x)` and result always matches `/^\d{4}-\d{2}-\d{2}$/`
    - **Property 1: Attendance date normalisation is idempotent and lossless**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 1.2 Write unit test for attendance round-trip (write → loadClassDate → forClassDate)
    - Write a record with a full ISO timestamp via `attendanceStore.upsert()`, call `loadClassDate(classId, "YYYY-MM-DD")`, verify `forClassDate()` returns the record
    - _Requirements: 1.4_

- [x] 2. Fix student delete write queue method
  - In `src/lib/offline/writeQueue.ts`, update `queueStudentWrite` signature to accept `"DELETE"` as a valid method and accept `null` as the payload type.
  - In `src/lib/stores/studentsStore.ts`, change `remove()` to call `queueStudentWrite("DELETE", \`/api/students/\${id}\`, null)` — remove the `"PUT"` call with `{ _delete: true }` body.
  - Verify `flushQueue()` passes `body: undefined` when `entry.body` is null (it already does `entry.body != null ? JSON.stringify(entry.body) : undefined` — confirm this is correct for DELETE).
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.1 Write property test for student delete queue method
    - Generate arbitrary student IDs with fast-check; for each, call `remove()` with a mock queue capture; verify every enqueued entry has `method === "DELETE"` and `body === null`
    - **Property 2: WriteQueue student delete always uses DELETE method**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 2.2 Write unit tests for flushQueue DELETE handling
    - Mock `fetch` to return 200 for DELETE — verify entry is removed from queue
    - Mock `fetch` to return 404 for DELETE — verify entry is marked `"stuck"`
    - _Requirements: 2.3, 2.4_

- [~] 3. Checkpoint — verify data bug fixes
  - Ensure all tests from tasks 1 and 2 pass.
  - Manually test in the browser: mark attendance for a class, navigate away, navigate back — records must appear without a hard reload.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Fix SSE reconnect exponential backoff
  - In `src/components/offline/OfflineProvider.tsx`, replace the fixed `5_000` ms timeout in `es.onerror` with an exponential backoff: start at 1 000 ms, double on each failure, cap at 30 000 ms.
  - Add `_sseBackoffMs` module-level variable (inside the component as a ref to survive re-renders: `const sseBackoffRef = useRef(1_000)`).
  - Reset the backoff to 1 000 ms in `es.onopen`.
  - _Requirements: 5.3_

  - [ ]* 4.1 Write property test for backoff delay sequence
    - Use fast-check to generate failure count N from 1 to 20; compute the delay sequence and verify it is non-decreasing, always ≤ 30 000, and equals `Math.min(1000 * 2^(N-1), 30000)`
    - **Property 3: SSE backoff delay grows monotonically and is capped**
    - **Validates: Requirements 5.3**

- [x] 5. Add ThemeProvider and SyncStatusBar hydration guards (enforce pattern)
  - Verify `ThemeProvider` initialises `useState<Theme>("light")` and reads `localStorage` only inside `useEffect` — this is already correct; add an explanatory comment confirming it is hydration-safe by design.
  - Verify `SyncStatusBar` already has the `mounted` guard returning `null` on server — already fixed; add a test to confirm.
  - Add a `mounted` guard to any other component in the codebase that reads `localStorage`, `window`, `navigator`, or Zustand offline-layer state on the first render. Search for `localStorage.getItem` in Client Components and confirm each one is guarded.
  - _Requirements: 3.1, 3.2, 3.4_

  - [ ]* 5.1 Write unit test for SyncStatusBar SSR output
    - Render SyncStatusBar with `renderToStaticMarkup` (SSR simulation) and verify the output is an empty string
    - _Requirements: 3.2_

- [x] 6. Memoize StudentsPage renders
  - In `src/app/principal/students/page.tsx`:
    - Wrap `openEdit` and `handleDelete` (and any other handler passed to a child) with `useCallback`, specifying correct dependencies.
    - Extract a `StudentRow` component outside the page function and wrap it with `React.memo`. Props: `{ s, cls, onEdit, onDelete, onNavigate }`.
    - Verify `visibleStudents` is already wrapped in `useMemo` with deps `[students, filterClassId, q]` — confirm `students` (the derived array) is the dep, not `rawStudents`.
    - Change any multi-value store destructuring (`const { students, loading } = useStudentsStore()`) to granular selectors (`const students = useStudentsStore(s => s.students)`).
  - Apply the same granular selector pattern to `useClassesStore` and `useStaffStore` reads in this page.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.1 Write unit test for visibleStudents memo correctness
    - Render StudentsPage with a mocked store; update an unrelated store slice; verify `visibleStudents` is not recomputed (use a spy on the filter function)
    - _Requirements: 4.1_

- [x] 7. Prioritise OfflineProvider store hydration order
  - In `src/components/offline/OfflineProvider.tsx`, restructure the hydration block into three phases as designed:
    - **Phase 1 (await):** `studentsStore.hydrate()` and `classesStore.hydrate()` in parallel.
    - **Phase 2 (fire-and-forget):** `assessmentStore.hydrate()` and `staffStore.hydrate()`.
    - **Phase 3 (setTimeout 0):** `libraryStore`, `timetableStore`, `calendarStore`, `disciplineStore`.
  - After phase 1 completes, if either students or classes store is empty, call the new `runSyncDomains(["students", "classes"])` immediately (background, no await).
  - _Requirements: 4.5, 8.1, 8.3_

  - [ ]* 7.1 Write unit test for priority hydration ordering
    - Mock each store's `hydrate()` to resolve after a small delay; verify that the students and classes hydrate promises resolve before the library and timetable hydrate promises are even started
    - _Requirements: 4.5_

- [x] 8. Add `runSyncDomains()` to sync engine
  - In `src/lib/offline/syncEngine.ts`, add `runSyncDomains(domains: DomainKey[])` that accepts an explicit domain list and runs a scoped sync (flush queue for those domains, then pull only those domains).
  - Add the in-memory `cleanDomains` Set optimisation: after any pull that returns 0 rows, add the domain to `cleanDomains`; skip its pull in subsequent `runSync()` calls until an SSE event for that domain arrives and removes it from the set.
  - Expose a `markDomainDirty(domain: DomainKey)` function that removes the domain from `cleanDomains` — call this from `OfflineProvider.handleSSEEvent` when a relevant event type arrives.
  - Reorder `DOMAINS` array to priority order: students, classes, attendance, assessmentFrameworks, assessmentPeriods, assessmentItems, then the rest.
  - _Requirements: 5.1, 5.2, 5.5_

  - [ ]* 8.1 Write unit test for domain skip optimisation
    - Mock `pullDomain` to return 0 rows for "students"; call `runSync()` twice; verify `pullDomain("students")` is called only once (second call is skipped)
    - _Requirements: 5.1, 5.2_

- [x] 9. Optimise `GET /api/students` — remove nested relations from list
  - In `src/app/api/students/route.ts`, change the `GET` handler's Prisma query from `include: { schoolClass, electives }` to `select: { id, admissionNumber, fullName, dateOfBirth, classId, parentName, parentContact, schoolId, createdAt, updatedAt }`.
  - Confirm the Students page uses `classMap.get(s.classId)` for the class name column (it does) — the `schoolClass` nested object was never used by the page component and can be safely removed.
  - The individual `GET /api/students/[id]` endpoint (used by the Edit modal) must keep its full `include` — do not modify it.
  - _Requirements: 6.1_

  - [ ]* 9.1 Write property test for students list response shape
    - Mock the Prisma client with fast-check generated student data; call the GET handler; for every response item, verify it does not contain `schoolClass` or `electives` keys
    - **Property 8: Students API list response excludes relations**
    - **Validates: Requirements 6.1**

- [x] 10. Add pagination cursors to delta pull endpoint
  - In `src/app/api/sync/pull/route.ts`:
    - Define `DOMAIN_LIMITS = { attendance: 1000, assessmentItems: 2000 }`.
    - For the `attendance` and `assessmentItems` cases, add `orderBy: { updatedAt: "asc" }` and `take: limit + 1`.
    - If the result length exceeds the limit, slice to `limit` rows and set `nextSince` to the `updatedAt` of the last included row.
    - Return `{ domain, rows, pulledAt, nextSince?: string }`.
  - In `src/lib/offline/syncEngine.ts`, update `pullDomain()` to follow pagination: if the response contains `nextSince`, continue fetching pages using `nextSince` as the new `since` parameter, accumulating rows, until `nextSince` is absent or the same as the previous cursor (loop guard).
  - _Requirements: 6.2, 6.3, 5.4_

  - [ ]* 10.1 Write property test for attendance pull pagination
    - Mock Prisma with fast-check generated datasets of random size > 1000; call the pull handler; verify response rows ≤ 1000 and `nextSince` is present when truncated
    - **Property 4: Attendance delta pull response never exceeds row limit**
    - **Validates: Requirements 6.2**

  - [ ]* 10.2 Write property test for assessmentItems pull pagination
    - Same pattern for assessmentItems with limit 2000
    - **Property 5: Assessment items delta pull response never exceeds row limit**
    - **Validates: Requirements 6.3**

- [~] 11. Checkpoint — verify sync and API fixes
  - Ensure all tests from tasks 4–10 pass.
  - Test manually: trigger a sync while online, verify the SyncStatusBar shows "Syncing…" briefly then goes clear.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Add missing PostgreSQL indexes via Prisma migration
  - Create a new Prisma migration file at `prisma/migrations/20260722100000_add_perf_indexes/migration.sql` with the four `CREATE INDEX IF NOT EXISTS` statements from the design document:
    - `Attendance(schoolId, updatedAt)`
    - `Student(schoolId, updatedAt)`
    - `AssessmentItem(schoolId, periodId, updatedAt)`
    - `Attendance(classId, date)` — confirm the schema's `@@index([classId, date])` directive already exists; if so, verify the migration_lock shows the index is applied, otherwise add it here.
  - Verify the migration does not include a `migration_lock.toml` entry that would require a Prisma client regeneration — indexes only, no model changes.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 12.1 Write smoke test for index existence
    - Query `pg_indexes` for each of the four index names and verify all four exist after running the migration against a test database
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 13. Add virtual scrolling to students list
  - Install `@tanstack/react-virtual` (pinned version `^3.5.0`) as a production dependency: `npm install @tanstack/react-virtual@3.5.0`.
  - In `src/app/principal/students/page.tsx`:
    - Extract the table body rows into a memoised `StudentRow` component (already done in task 6).
    - Add a `VIRTUAL_THRESHOLD = 100` constant.
    - When `visibleStudents.length > VIRTUAL_THRESHOLD`, render the virtualised version using `useVirtualizer` with `estimateSize: () => 49` and `overscan: 10`.
    - When `visibleStudents.length <= VIRTUAL_THRESHOLD`, render the existing standard `<table>` unchanged.
    - Wrap the scroll container in a `<div ref={parentRef}>` with `style={{ height: "60vh", overflowY: "auto" }}`.
    - Preserve all existing click handlers (navigate to profile, open edit modal, delete confirmation).
  - _Requirements: 9.1, 9.3, 9.4_

  - [ ]* 13.1 Write property test for virtual list row count invariant
    - Use fast-check to generate student arrays of length N > 100; render StudentTable; query the DOM for `<tr>` elements; verify count is always ≤ 50 (overscan of 10 + visible ~10 + buffer)
    - **Property 6: Virtual list limits rendered rows**
    - **Validates: Requirements 9.1**

  - [ ]* 13.2 Write property test for standard rendering threshold
    - Generate student arrays of length N ≤ 100; render StudentTable; verify all N rows are present in the DOM
    - **Property 7: Virtual list threshold boundary**
    - **Validates: Requirements 9.3**

  - [ ]* 13.3 Write unit test for click handler preservation in virtual list
    - Render the virtual list with > 100 students; find a visible row; simulate click on name link and verify navigation is called; simulate click on Edit and verify the edit modal opens
    - _Requirements: 9.4_

- [x] 14. Generate PNG icons and update PWA manifest
  - Create `scripts/generate-pwa-icons.js`:
    - Use `sharp` (already present as a Next.js dependency) to rasterise `public/icons/icon-512.svg` to PNG at 192×192 → `public/icons/icon-192.png` and 512×512 → `public/icons/icon-512.png`.
    - Log success or error and exit with code 1 on failure.
  - Run the script: `node scripts/generate-pwa-icons.js` and commit the generated PNG files.
  - Update `public/manifest.json` to list PNG icons first (required by Chrome), then SVG icons as additional entries. Set `"purpose": "any"` on the 192 PNG and `"purpose": "maskable"` on the 512 PNG.
  - _Requirements: 10.1, 10.3, 10.4_

  - [ ]* 14.1 Write unit test for manifest icon entries
    - Parse `manifest.json`; verify it contains at least one PNG icon with `sizes: "192x192"` and one with `sizes: "512x512"`; verify both PNG files exist on disk and are non-empty
    - _Requirements: 10.1, 10.3_

- [x] 15. Fix service worker config — sync/pull NetworkOnly + offline fallback
  - In `next.config.js`:
    - Add a new `NetworkOnly` rule for `/api/sync/pull` **before** the catch-all `StaleWhileRevalidate` HTML pages rule (rule order matters in Workbox).
    - Add `fallbacks: { document: "/offline.html" }` to the `withPWA` config object.
  - Create `public/offline.html` — a minimal, self-contained HTML page (no external dependencies) that:
    - Displays the Bidii name and a "You're offline" message in the school's brand colours (`#1E3A8A` blue, `#F7F5EF` background).
    - Shows a "Retry" button that calls `window.location.reload()`.
    - Includes inline CSS only (no external stylesheets).
  - _Requirements: 11.3, 11.4_

  - [ ]* 15.1 Write unit test for service worker config
    - Parse `next.config.js` (or its evaluated output); verify `/api/sync/pull` maps to `NetworkOnly`; verify a fallback document is configured
    - _Requirements: 11.3, 11.4_

- [~] 16. Final checkpoint — full integration verification
  - Run the full test suite (`npm test -- --run` or `jest --ci`).
  - Run `node scripts/generate-pwa-icons.js` and verify both PNG files exist.
  - Start the dev server and verify no hydration warnings appear in the browser console on any page.
  - Navigate to the Students page and verify the list renders from the Zustand store without a "Loading…" spinner when the store is already populated.
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional property/unit tests. Skip them for a faster MVP; run them for a production-quality implementation.
- All tasks build on each other in order — task 7 depends on task 6 (OfflineProvider restructure requires memoised components to be in place first).
- Task 12 (database indexes) requires direct database access to apply the migration — run `npx prisma migrate deploy` against the target database.
- Task 14 (PNG icon generation) requires `sharp` to be resolvable from the project root; it ships with Next.js but may need to be explicitly installed if it was hoisted out of `node_modules`. Run `npm install sharp` if the script fails.
- Property tests use **fast-check**: install with `npm install --save-dev fast-check`.

