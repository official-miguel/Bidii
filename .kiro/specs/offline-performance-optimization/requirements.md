# Requirements Document

## Introduction

The Bidii school management system already has a complete offline-first architecture: IndexedDB (BidiiDB) backed by 10 Zustand stores, a unified write queue, an SSE real-time layer, and a next-pwa service worker. This feature optimises that existing architecture to deliver a **premium native-app feel** — instant navigation, no blank pages, no unnecessary spinners, no full-page re-renders — without replacing any existing infrastructure.

There are seven categories of work, ordered by user-visible impact:

1. **Offline layer data bugs** — data that should display is silently missing or queued writes fail to reach the server.
2. **Hydration errors** — server/client HTML mismatches that produce React console errors and potential visual glitches on first paint.
3. **React render performance** — unnecessary re-renders and missing memoisation that slow down the UI on mid-range devices.
4. **Sync engine optimisation** — wasteful full-domain pulls and missing SSE reconnect backoff that hammer the server unnecessarily.
5. **API optimisation** — over-fetching (full relations on list endpoints), unbounded delta pulls, and N+1 query patterns.
6. **Database indexes** — missing PostgreSQL indexes on frequently-queried columns that cause sequential scans at scale.
7. **Progressive loading and PWA polish** — background preloading for the most-visited modules, virtual scrolling for large lists, and proper PWA icon assets.

---

## Glossary

- **AttendanceStore**: The Zustand store (`src/lib/stores/attendanceStore.ts`) managing offline attendance records.
- **BidiiDB**: The IndexedDB database (`bidii_local_db`) defined in `src/lib/offline/db.ts`, versioned at DB_VERSION.
- **by-class-date index**: The compound IndexedDB index on the `attendance` store keyed by `[classId, date]`.
- **Delta pull**: `GET /api/sync/pull?domain=<domain>&since=<unixMs>` — returns only rows updated after `since`.
- **ExponentialBackoff**: A reconnect delay strategy where each successive failure multiplies the wait time by a fixed factor, capped at a maximum.
- **OfflineProvider**: The root client component (`src/components/offline/OfflineProvider.tsx`) that hydrates stores and manages SSE.
- **runSync()**: The primary sync orchestrator in `src/lib/offline/syncEngine.ts`.
- **SSE**: Server-Sent Events stream at `GET /api/events/stream` used for real-time push updates.
- **SyncStatusBar**: The sidebar component (`src/components/offline/SyncStatusBar.tsx`) displaying queue state.
- **ThemeProvider**: The React context provider (`src/components/ThemeProvider.tsx`) managing dark/light mode via localStorage.
- **VirtualList**: A windowed rendering technique that only renders DOM rows currently visible in the viewport.
- **WriteQueue**: The IndexedDB-backed write queue in `src/lib/offline/writeQueue.ts` with `enqueueWrite()` / `flushQueue()`.
- **Zustand Store**: Any of the 10 module stores in `src/lib/stores/` that hold in-memory state hydrated from IndexedDB.

---

## Requirements

### Requirement 1: Attendance IndexedDB Key Mismatch Fix

**User Story:** As a teacher, I want attendance records I have recorded to appear correctly on the attendance page, so that I can confirm which students are marked present or absent without refreshing from the server.

#### Acceptance Criteria

1. WHEN `attendanceStore.loadClassDate(classId, date)` is called with a date string in `"YYYY-MM-DD"` format, THE AttendanceStore SHALL query the `by-class-date` index using a date key that matches the ISO string format stored in IndexedDB for that record.
2. WHEN the sync engine pulls attendance records from `GET /api/sync/pull?domain=attendance`, THE SyncEngine SHALL normalise the `date` field of each record to the `"YYYY-MM-DD"` date-only format before writing to IndexedDB.
3. WHEN an attendance record is written to IndexedDB via `dbPut("attendance", record)`, THE AttendanceStore SHALL store the `date` field as a `"YYYY-MM-DD"` date-only string, not a full ISO timestamp with time component.
4. WHEN `forClassDate(classId, date)` is called after `loadClassDate` has completed, THE AttendanceStore SHALL return a non-empty array for any class+date combination for which attendance records exist in IndexedDB.

### Requirement 2: Student Delete Write Queue Bug Fix

**User Story:** As a principal, I want to remove a student from the system, so that the student record is permanently deleted from the server even when the delete is initiated while offline.

#### Acceptance Criteria

1. WHEN `studentsStore.remove(id, schoolId)` enqueues a write for a student deletion, THE WriteQueue SHALL store the entry with method `"DELETE"`, not `"PUT"`.
2. WHEN `flushQueue()` processes a student deletion entry, THE WriteQueue SHALL send an HTTP `DELETE` request to `/api/students/<id>`, not a `PUT` request.
3. IF `flushQueue()` sends a student deletion and the server returns a `2xx` status, THEN THE WriteQueue SHALL remove that entry from the queue.
4. IF `flushQueue()` sends a student deletion and the server returns a `4xx` status, THEN THE WriteQueue SHALL mark that entry as `"stuck"` so the user can see the failure in SyncStatusBar.

### Requirement 3: Hydration Error Prevention

**User Story:** As a user on any page, I want the app to load without React hydration mismatch warnings, so that the UI is consistent between server render and client paint and I never see a flash of incorrect content.

#### Acceptance Criteria

1. THE ThemeProvider SHALL initialise its React state to `"light"` on the server and defer reading `localStorage` until after the component mounts, so the SSR-rendered HTML and the first client render are identical.
2. WHEN SyncStatusBar renders on the server, THE SyncStatusBar SHALL render `null` (no output), matching its post-mount default state before the Zustand store has been read.
3. WHEN Sidebar reads `usePathname()`, THE Sidebar SHALL suppress any hydration warning on the active-link highlight by either deferring the active class calculation until after mount or using `suppressHydrationWarning` appropriately, ensuring the server-rendered active state matches the client.
4. WHEN any component that reads browser-only state (localStorage, IndexedDB, navigator, window) renders during SSR, THAT component SHALL produce output identical to its initial client-side state before `useEffect` fires.

### Requirement 4: React Render Memoisation

**User Story:** As a user on the Students page, I want the UI to respond instantly when I type in the search box, so that filtering 1,000+ students feels immediate on a mid-range Android device.

#### Acceptance Criteria

1. THE StudentsPage SHALL wrap the `visibleStudents` derivation in `useMemo` with dependencies `[students, filterClassId, q]`, so the list is only recomputed when those three values change.
2. THE StudentsPage SHALL wrap event handlers passed as props to child components (e.g. `openEdit`, `handleDelete`) in `useCallback`, so child components do not re-render due to new function references.
3. WHEN the `students` array in the Zustand store is updated for one student, THE StudentsPage SHALL not re-render the rows of students that were not changed, by memoising row components with `React.memo`.
4. WHEN a Zustand store selector in a page component reads only a slice of the store state (e.g. `loading` flag), THE Selector SHALL use a granular selector function (e.g. `useStudentsStore(s => s.loading)`) so only changes to that specific slice trigger a re-render, not any change to the store.
5. THE OfflineProvider SHALL hydrate stores sequentially in priority order rather than all in parallel: students and classes first, then attendance frameworks and periods, then all other stores, so the main thread is not saturated by simultaneous large IndexedDB reads on low-end devices.

### Requirement 5: Sync Engine Optimisation

**User Story:** As a user on a mobile device, I want background sync to consume minimal bandwidth and CPU, so that the battery does not drain quickly and the app stays responsive while syncing.

#### Acceptance Criteria

1. WHEN `runSync()` starts a delta pull for any domain, THE SyncEngine SHALL skip that domain's pull if the domain returned zero rows in the previous pull AND no local writes for that domain exist in the WriteQueue since the last pull, logging the skip at debug level.
2. WHEN `pullDomain(domain)` receives a response with zero rows, THE SyncEngine SHALL record that the domain is "clean" and skip its pull in subsequent `runSync()` calls until either an SSE event arrives for that domain or a local write is enqueued for that domain.
3. WHEN the SSE connection's `onerror` handler fires, THE OfflineProvider SHALL wait at least 1 second before the first reconnect attempt, doubling the delay on each successive failure up to a maximum of 30 seconds, and SHALL reset the delay to 1 second after a successful connection is established.
4. WHEN the `assessmentItems` delta pull is requested with `since=0` (first sync), THE SyncEngine SHALL limit the pull to records belonging to the current assessment period only (already implemented in the server route) and SHALL additionally cap the response to a maximum of 2,000 rows per pull, requesting subsequent pages if more rows exist.
5. WHILE background sync is running, THE SyncEngine SHALL process domains in the following priority order: students, classes, attendance, assessmentFrameworks, assessmentPeriods, assessmentItems, then all remaining domains, so that the most user-critical data is refreshed first.

### Requirement 6: API Response Optimisation

**User Story:** As a user loading the students list page, I want the page data to load and render quickly on a slow 3G connection, so that I can access student information promptly without waiting for unnecessary data.

#### Acceptance Criteria

1. WHEN `GET /api/students` is called without a specific student ID, THE StudentsAPI SHALL return only the fields required for list rendering: `id`, `admissionNumber`, `fullName`, `classId`, `dateOfBirth`, `parentName`, `parentContact`, `schoolId`, `createdAt`, `updatedAt` — excluding nested relations (`schoolClass`, `electives`) from the list response.
2. WHEN `GET /api/sync/pull?domain=attendance&since=0` is called (first sync), THE SyncAPI SHALL return at most 1,000 attendance records per response and SHALL include a `nextSince` cursor in the response so the client can paginate through historical data.
3. WHEN `GET /api/sync/pull?domain=assessmentItems` is called, THE SyncAPI SHALL return at most 2,000 rows per response, restricted to the current period, and SHALL include a `nextSince` cursor if more rows exist beyond the limit.
4. WHEN any `GET /api/sync/pull` endpoint builds its Prisma query, THE SyncAPI SHALL use `select` (not `include`) to return only the fields that map to the corresponding `LocalXxx` type in `db.ts`, preventing accidental over-fetching as the Prisma schema grows.

### Requirement 7: Missing Database Indexes

**User Story:** As a system administrator managing a school with 5,000 students and 200,000 attendance records, I want API queries to return results in under 200ms, so that the sync engine does not time out on slow servers.

#### Acceptance Criteria

1. THE Database SHALL have a PostgreSQL index on `Attendance(schoolId, updatedAt)` so that delta pull queries for attendance filtered by `schoolId` and `updatedAt > since` use an index scan rather than a sequential table scan.
2. THE Database SHALL have a PostgreSQL index on `Student(schoolId, updatedAt)` so that delta pull queries for students filtered by `schoolId` and `updatedAt > since` use an index scan rather than a sequential table scan.
3. THE Database SHALL have a PostgreSQL index on `AssessmentItem(schoolId, periodId, updatedAt)` so that delta pull queries for assessment items filtered by school, period, and recency use an index scan.
4. THE Database SHALL have a PostgreSQL index on `Attendance(classId, date)` to accelerate the teacher's attendance page query that filters by class and date.
5. WHEN a Prisma migration is created for the new indexes, THE Migration SHALL be applied without data loss to any existing database that already has data in the affected tables.

### Requirement 8: Background Preloading on Dashboard Mount

**User Story:** As a principal or teacher who opens the dashboard, I want the Students, Attendance, and other frequently-used pages to load instantly when I navigate to them, so that I never see a "Loading…" spinner after the dashboard has fully loaded.

#### Acceptance Criteria

1. WHEN the dashboard page finishes its initial render and the OfflineProvider has completed its first hydration pass, THE OfflineProvider SHALL trigger a background sync for the `students` and `classes` domains within 500ms if those stores are empty (zero records in memory).
2. WHEN the students store contains fewer records in memory than the count stored in IndexedDB for the current school, THE StudentsPage SHALL immediately read from IndexedDB to fill the gap without waiting for a network sync, displaying the cached data within 100ms of page mount.
3. WHEN the OfflineProvider has completed its priority-1 hydration (students and classes), THE OfflineProvider SHALL begin hydrating the remaining stores (attendance frameworks, timetable, library, calendar, discipline) in the background without blocking the React render cycle.
4. WHEN a user navigates from the Dashboard to the Students page, THE StudentsPage SHALL render the student list from the Zustand store within 100ms if the store is already populated, showing no "Loading…" state.

### Requirement 9: Virtual Scrolling for Large Student Lists

**User Story:** As a principal at a school with 1,000+ students, I want to scroll through the student list smoothly at 60 FPS, so that the page does not stutter or freeze on my mobile device.

#### Acceptance Criteria

1. WHEN the students list contains more than 100 visible rows, THE StudentsPage SHALL render only the rows currently within or near the visible viewport using a virtual list implementation (e.g. `react-window` or `@tanstack/react-virtual`), limiting the number of DOM nodes to at most 50 rendered rows at any time.
2. WHEN a user scrolls through the student list, THE VirtualList SHALL maintain at least 30 FPS on a mid-range Android device (≥ Snapdragon 665 class) as measured by Chrome DevTools Performance trace.
3. WHEN filtering reduces the visible student list to 100 or fewer rows, THE StudentsPage SHALL switch to standard (non-virtual) rendering to avoid the overhead of the virtual list for small datasets.
4. WHEN the virtual list is active, THE StudentsPage SHALL preserve the ability to click a student row to navigate to the student profile page, to open the edit modal, and to trigger the delete confirmation.

### Requirement 10: PWA Installability — PNG Icons

**User Story:** As a teacher or principal on an Android device, I want to be prompted to install Bidii as a home screen app, so that I can open it like a native app without a browser address bar.

#### Acceptance Criteria

1. THE PWA manifest SHALL reference at least one PNG icon of size `192×192` and one PNG icon of size `512×512`, because Chrome on Android requires PNG icons for installability prompts.
2. WHEN Chrome evaluates the PWA manifest for installability, THE Manifest SHALL satisfy the minimum icon requirements so that the "Add to Home Screen" prompt is eligible to appear.
3. THE public directory SHALL contain `/icons/icon-192.png` and `/icons/icon-512.png` files that are valid PNG images matching the sizes declared in the manifest.
4. WHERE SVG icons are also listed in the manifest (for Safari and other browsers that support SVG), THE Manifest SHALL list the SVG entries in addition to (not instead of) the required PNG entries.

### Requirement 11: Service Worker — No Stale API Cache

**User Story:** As a user, I want my app to always show fresh data after a sync completes, so that I do not see outdated student or attendance records served from a stale service worker cache.

#### Acceptance Criteria

1. WHEN the service worker's `StaleWhileRevalidate` handler for `/api/students` serves a cached response, THE ServiceWorker SHALL update the cache in the background so the next navigation gets fresh data.
2. THE service worker cache for API read routes SHALL have a maximum age of 24 hours and a maximum entry count of 500, so that stale data is automatically evicted.
3. THE next.config.js runtime caching configuration SHALL explicitly list the `/api/sync/pull` route as `NetworkOnly` so delta pull responses are never served from cache — the whole point of delta pull is to get fresh data.
4. THE service worker configuration SHALL include an `offline.html` fallback page that is shown when a user navigates to an uncached route while offline, rather than showing the browser's default "no internet" error page.

