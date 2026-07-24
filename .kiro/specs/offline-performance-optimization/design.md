# Design Document: Offline Performance Optimization

## Overview

This document describes the technical design for hardening and optimising Bidii's existing offline-first architecture. The goal is a **premium native-app feel**: instant navigation, no blank pages, no spinner loops, no React hydration errors, and no silent data loss. The existing infrastructure (BidiiDB, Zustand stores, SSE, next-pwa) is preserved entirely — this is an optimisation and bug-fix layer, not a rewrite.

Changes are grouped into seven concern areas, each traced directly to requirements.

---

## Architecture

The existing architecture is unchanged in structure. The diagram below highlights the components touched by this optimisation pass (shaded):

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Tab                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React UI  (Next.js App Router pages)                   │   │
│  │  ■ StudentsPage — virtual list + memoisation            │   │
│  │  ■ ThemeProvider — defer localStorage until mount       │   │
│  │  ■ SyncStatusBar — already fixed, pattern enforced      │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │ subscribe (granular selectors)          │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │  Zustand Stores                                         │   │
│  │  ■ studentsStore — merge() and selectors unchanged      │   │
│  └────────────┬──────────────────────┬─────────────────────┘   │
│               │ persist              │ optimistic write        │
│  ┌────────────▼──────────┐  ┌────────▼────────────────────┐   │
│  │  IndexedDB (BidiiDB)  │  │  WriteQueue                 │   │
│  │  ■ attendance date    │  │  ■ student delete → DELETE  │   │
│  │    normalization      │  │    method (not PUT)         │   │
│  └───────────────────────┘  └────────┬────────────────────┘   │
│                                       │ flush on online         │
│  ┌──────────────────────┐   ┌────────▼────────────────────┐   │
│  │  SSE listener        │   │  Service Worker (next-pwa)  │   │
│  │  ■ exponential       │   │  ■ /api/sync/pull NetworkOnly│   │
│  │    backoff reconnect │   │  ■ offline.html fallback    │   │
│  └──────────────────────┘   └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────────┐
│  Next.js Server                                                 │
│  ■ GET /api/students — select only list fields                  │
│  ■ GET /api/sync/pull — pagination cursors + row limits        │
│  ■ Prisma migrations — 4 new PostgreSQL indexes                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### 1. AttendanceStore — Date Normalisation (`src/lib/stores/attendanceStore.ts`)

**Problem:** `Attendance.date` is stored in PostgreSQL as a `DateTime` field. When Prisma serialises it to JSON for the delta pull response, it returns a full ISO string like `"2026-07-20T00:00:00.000Z"`. The IndexedDB `by-class-date` compound index stores this value verbatim. Meanwhile, `loadClassDate()` queries the index with a date-only key like `"2026-07-20"`. The compound key lookup `[classId, "2026-07-20"]` never matches `[classId, "2026-07-20T00:00:00.000Z"]` — so the function always returns zero records.

**Fix — two-point normalisation:**

```typescript
// Utility — applied at every IDB write point
function normDate(raw: string): string {
  // Strips any time component: "2026-07-20T00:00:00.000Z" → "2026-07-20"
  return raw.slice(0, 10);
}
```

Applied at:
1. `attendanceStore.merge()` — normalise each incoming record's `date` before `tx.store.put(r)`.
2. `syncEngine.mergeRows("attendance", rows)` — rows arrive from the API with full ISO timestamps; normalise before calling `attendanceStore.merge()`.
3. `attendanceStore.upsert()` / `upsertMany()` — normalise before `dbPut`.

No IndexedDB schema migration is needed — the `by-class-date` index definition is unchanged. Once existing records are re-synced with normalized dates, lookups will work correctly.

### 2. WriteQueue — Student Delete Method Fix (`src/lib/offline/writeQueue.ts` + `src/lib/stores/studentsStore.ts`)

**Problem:** `studentsStore.remove()` calls `queueStudentWrite("PUT", ...)` with `{ _delete: true }` as the body. The server's `DELETE /api/students/:id` endpoint expects an HTTP `DELETE`, not a `PUT` with a magic body flag.

**Fix — `queueStudentWrite` overload and `remove()` correction:**

```typescript
// writeQueue.ts — add DELETE to allowed methods
export function queueStudentWrite(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload: Record<string, unknown> | null
): Promise<WriteQueueEntry>

// studentsStore.ts — remove() corrected
async remove(id, schoolId) {
  set((s) => ({ students: s.students.filter((x) => x.id !== id) }));
  await dbDelete("students", id);
  await queueStudentWrite("DELETE", `/api/students/${id}`, null);
}
```

The `flushQueue()` implementation already passes `entry.method` through to `fetch()`, so the DELETE will be sent correctly once the queue entry stores the right method.

### 3. Hydration Error Prevention

**ThemeProvider** (`src/components/ThemeProvider.tsx`):

The current code calls `localStorage.getItem()` inside `useEffect`, which is correct — but the initial `useState<Theme>("light")` means SSR renders with `theme="light"`, and the first client render also sees `"light"` until `useEffect` fires. This is safe. The `ThemeScript` inline script prevents visual flash by applying the class before React hydrates. No code change needed for ThemeProvider — it is already hydration-safe.

**SyncStatusBar** — already fixed with the `mounted` guard. The pattern must be enforced for any new component reading Zustand store state.

**Sidebar** — `usePathname()` is a client-side hook in Next.js App Router. When rendered inside a Client Component, it returns the correct pathname on both server and client without mismatch. The active-link classes computed from `pathname` are applied consistently. No change needed.

**Enforcement pattern for future components:**

```typescript
// Template: any component reading browser-only state
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return <Skeleton />; // or null
// ... browser-only reads are safe below here
```

### 4. React Memoisation (`src/app/principal/students/page.tsx`)

Changes are additive — no existing behaviour changes:

```typescript
// 1. Stable event handler references
const openEdit   = useCallback((s: Student) => { ... }, []);
const handleDelete = useCallback((s: Student) => { ... }, []);

// 2. visibleStudents derivation — deps already match current code
// (was already using useMemo — verify deps include `students`, not `rawStudents`)
const visibleStudents = useMemo(() => { ... }, [students, filterClassId, q]);

// 3. Row memoisation
const StudentRow = React.memo(function StudentRow({ s, cls, onEdit, onDelete, onNavigate }) {
  return <tr>...</tr>;
});
```

**Granular Zustand selectors** — replace multi-field destructuring with scoped selectors:

```typescript
// Before (re-renders on any students store change):
const { students, loading } = useStudentsStore();

// After (re-renders only when the specific slice changes):
const students  = useStudentsStore((s) => s.students);
const loading   = useStudentsStore((s) => s.loading);
```

**OfflineProvider priority hydration:**

```typescript
// Phase 1 (blocking — critical path)
await Promise.allSettled([
  useStudentsStore.getState().hydrate(schoolId),
  useClassesStore.getState().hydrate(schoolId),
]);

// Phase 2 (non-blocking — assessment metadata needed for mark-entry)
Promise.allSettled([
  useAssessmentStore.getState().hydrate(schoolId),
  useStaffStore.getState().hydrate(schoolId),
]).catch(console.error);

// Phase 3 (fully background — rarely visited on first session)
setTimeout(() => {
  Promise.allSettled([
    useLibraryStore.getState().hydrate(schoolId),
    useTimetableStore.getState().hydrate(schoolId),
    useCalendarStore.getState().hydrate(schoolId),
    useDisciplineStore.getState().hydrate(schoolId),
  ]).catch(console.error);
}, 0);
```

### 5. Sync Engine Optimisation (`src/lib/offline/syncEngine.ts`)

**Domain "clean" tracking:**

```typescript
// In-memory (reset on page reload — acceptable since it's an optimisation hint)
const cleanDomains = new Set<DomainKey>();

async function pullDomain(domain: DomainKey): Promise<PullResponse | null> {
  if (cleanDomains.has(domain)) return null; // skip
  const result = await fetchDomain(domain);
  if (result && result.rows.length === 0) cleanDomains.add(domain);
  return result;
}

// SSE event handler in OfflineProvider — invalidate on any server push:
function handleSSEEvent(event: SSEEvent) {
  const domainForType: Partial<Record<string, DomainKey>> = {
    "student.created": "students", "student.updated": "students",
    "attendance.upserted": "attendance",
    // ... etc
  };
  const domain = domainForType[event.type];
  if (domain) cleanDomains.delete(domain); // mark dirty
  // ... existing dispatch
}
```

**Priority pull ordering:**

```typescript
const PRIORITY_DOMAINS: DomainKey[] = ["students", "classes", "attendance", "assessmentFrameworks", "assessmentPeriods"];
const SECONDARY_DOMAINS: DomainKey[] = ["assessmentItems", "libraryBooks", "libraryCards", "libraryBorrows", "timetableSlots", "calendarEvents", "disciplineRecords", "teachers", "departments", "subjects"];
```

Pull priority domains first (sequentially), then secondary domains in batches of 4.

**SSE exponential backoff:**

```typescript
let _sseBackoffMs = 1_000;
const SSE_MAX_BACKOFF = 30_000;

es.onerror = () => {
  es.close();
  sseRef.current = null;
  const delay = _sseBackoffMs;
  _sseBackoffMs = Math.min(_sseBackoffMs * 2, SSE_MAX_BACKOFF);
  setTimeout(() => {
    if (navigator.onLine) openSSE();
  }, delay);
};

// On successful open/message — reset backoff:
es.onopen = () => { _sseBackoffMs = 1_000; };
```

### 6. API Response Optimisation

**`GET /api/students`** (`src/app/api/students/route.ts`):

Change `include` to `select` in the list query to return only list-rendering fields:

```typescript
// Before
include: {
  schoolClass: { select: { id, name, form, stream } },
  electives: { include: { subject: { select: { id, name, code } } } },
}

// After (list endpoint only — individual student GET unchanged)
select: {
  id: true, admissionNumber: true, fullName: true,
  dateOfBirth: true, classId: true, parentName: true,
  parentContact: true, schoolId: true, createdAt: true, updatedAt: true,
}
```

The `classId` is already in the store's `LocalStudent` type and is used directly for the class-name lookup via `classMap`. The nested `schoolClass` relation was redundant.

**`GET /api/sync/pull` — pagination cursors** (`src/app/api/sync/pull/route.ts`):

Add `limit` and cursor support for large domains:

```typescript
const DOMAIN_LIMITS: Partial<Record<Domain, number>> = {
  attendance: 1_000,
  assessmentItems: 2_000,
};

// In the attendance and assessmentItems cases:
const limit = DOMAIN_LIMITS[domain];
const rows = await prisma.attendance.findMany({
  where: { schoolId, updatedAt: { gt: since } },
  orderBy: { updatedAt: "asc" },
  take: limit ? limit + 1 : undefined,
  select: { ... },
});

const hasMore = limit && rows.length > limit;
const pageRows = hasMore ? rows.slice(0, limit) : rows;
const nextSince = hasMore
  ? (pageRows[pageRows.length - 1] as { updatedAt: string }).updatedAt
  : undefined;

return NextResponse.json({ domain, rows: serialize(pageRows), pulledAt, nextSince });
```

The sync engine will need to follow `nextSince` in a loop until `nextSince` is absent.

### 7. Database Indexes — Prisma Migration

New migration: `20260722100000_add_perf_indexes`

```sql
-- Speeds up delta pull for attendance (schoolId + updatedAt filter)
CREATE INDEX IF NOT EXISTS "Attendance_schoolId_updatedAt_idx"
  ON "Attendance"("schoolId", "updatedAt");

-- Speeds up delta pull for students
CREATE INDEX IF NOT EXISTS "Student_schoolId_updatedAt_idx"
  ON "Student"("schoolId", "updatedAt");

-- Speeds up assessment items delta pull (school + period + recency)
CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_periodId_updatedAt_idx"
  ON "AssessmentItem"("schoolId", "periodId", "updatedAt");

-- Speeds up teacher attendance page query (classId + date)
-- Note: Attendance already has @@index([classId, date]) in schema —
-- verify migration_lock confirms it exists; if missing, add:
CREATE INDEX IF NOT EXISTS "Attendance_classId_date_idx"
  ON "Attendance"("classId", "date");
```

All are `CREATE INDEX IF NOT EXISTS` — safe to apply to databases with existing data; Postgres builds the index online (with `CONCURRENTLY` flag) without locking the table.

### 8. Background Preloading

The OfflineProvider is already the right place for this. After priority hydration completes, trigger an immediate runSync scoped to critical domains if either store is empty:

```typescript
// After phase-1 hydration completes:
const studentCount = useStudentsStore.getState().students.length;
const classCount   = useClassesStore.getState().classes.length;
if (studentCount === 0 || classCount === 0) {
  // Pull only the priority domains immediately (skip the rest for now)
  runSyncDomains(["students", "classes"]).catch(console.error);
}
```

A new `runSyncDomains(domains: DomainKey[])` function will accept an explicit list instead of always iterating all 15 domains.

### 9. Virtual Scrolling (`@tanstack/react-virtual`)

The project already uses React 18. `@tanstack/react-virtual` v3 is the lightest virtualisation library compatible with Next.js App Router and works without a fixed `itemSize` (supports dynamic row heights via `measureElement`).

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUAL_THRESHOLD = 100;

function StudentTable({ students, ... }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: students.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49, // px — approx row height
    overscan: 10,
  });

  if (students.length <= VIRTUAL_THRESHOLD) {
    return <StandardTable students={students} ... />;
  }

  return (
    <div ref={parentRef} style={{ height: "60vh", overflowY: "auto" }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.index}
            style={{ position: "absolute", top: vRow.start, width: "100%" }}
          >
            <StudentRow student={students[vRow.index]} ... />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 10. PWA PNG Icons

The manifest currently references only SVG icons. Chrome on Android does not accept SVG icons for the PWA install prompt. PNG icons must be added.

**Generation approach** — use a Node.js script with the `sharp` library (already a transitive dependency of Next.js) to rasterise the existing SVG icons to PNG at 192×192 and 512×512:

```javascript
// scripts/generate-pwa-icons.js
const sharp = require("sharp");
sharp("public/icons/icon-512.svg").resize(192).png().toFile("public/icons/icon-192.png");
sharp("public/icons/icon-512.svg").resize(512).png().toFile("public/icons/icon-512.png");
```

Manifest update:

```json
{
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
  ]
}
```

### 11. Service Worker — sync/pull as NetworkOnly + offline.html

In `next.config.js`, add `/api/sync/pull` to the NetworkOnly list and configure an offline fallback:

```javascript
// NetworkOnly — delta pulls must always come from the network
{ urlPattern: /\/api\/sync\/pull/i, handler: "NetworkOnly" },

// Offline fallback
fallbacks: { document: "/offline.html" }
```

Create `public/offline.html` — a minimal styled page that matches the Bidii brand and explains offline mode.

---

## Data Models

No new Prisma models are introduced. The `LocalAttendance` type already has `date: string` typed as ISO string — the normalisation is purely at the application layer.

**New SyncEngine state (in-memory only):**

```typescript
// src/lib/offline/syncEngine.ts — module-level
const cleanDomains = new Set<DomainKey>();
const domainDirtyOn = new Map<DomainKey, number>(); // domain → timestamp of last SSE invalidation
```

**Extended pull response type:**

```typescript
type PullResponse = {
  domain: DomainKey;
  rows: unknown[];
  pulledAt: number;
  nextSince?: string; // ISO string cursor — present only when rows were truncated
};
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Attendance date normalisation is idempotent and lossless

*For any* valid ISO date string (with or without time component), applying the `normDate()` function should produce a string matching `YYYY-MM-DD` format, and applying it twice should produce the same result as applying it once.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: WriteQueue student delete always uses DELETE method

*For any* student ID, calling `studentsStore.remove(id, schoolId)` should result in exactly one WriteQueue entry with `method === "DELETE"` for that student ID, and no entry with `method === "PUT"` or `method === "PATCH"` for the same delete operation.

**Validates: Requirements 2.1, 2.2**

### Property 3: SSE backoff delay grows monotonically and is capped

*For any* sequence of consecutive SSE connection failures of length N (where N ≥ 1), the computed reconnect delay for failure N should be `min(1000 * 2^(N-1), 30000)` milliseconds, and the sequence of delays should be strictly non-decreasing up to the cap.

**Validates: Requirements 5.3**

### Property 4: Attendance delta pull response never exceeds row limit

*For any* school with more than 1,000 attendance records updated after a given `since` timestamp, a request to `GET /api/sync/pull?domain=attendance&since=<ts>` should return at most 1,000 rows and should include a `nextSince` cursor in the response body.

**Validates: Requirements 6.2**

### Property 5: Assessment items delta pull response never exceeds row limit

*For any* school with more than 2,000 assessment items in the current period updated after a given `since` timestamp, a request to `GET /api/sync/pull?domain=assessmentItems&since=<ts>` should return at most 2,000 rows and should include a `nextSince` cursor.

**Validates: Requirements 6.3**

### Property 6: Virtual list limits rendered rows

*For any* list of students with more than 100 entries, rendering the `StudentTable` component should result in at most 50 `<tr>` elements in the DOM at any given time, regardless of total list size.

**Validates: Requirements 9.1**

### Property 7: Virtual list threshold boundary

*For any* student list with 100 or fewer entries, rendering the `StudentTable` component should use standard (non-virtual) rendering, meaning all rows are present in the DOM simultaneously.

**Validates: Requirements 9.3**

### Property 8: Students API list response excludes relations

*For any* school with registered students, a `GET /api/students` response should not contain `schoolClass` or `electives` fields in any item in the response array.

**Validates: Requirements 6.1**

---

## Error Handling

### Attendance IDB query returning zero results
After the fix, if `loadClassDate()` returns an empty array when records exist, it indicates one of: (a) the sync has not run yet, (b) the date normalization migration has not been applied to existing records. The store should show a `"Refresh attendance"` prompt that triggers `runSync("attendance")`.

### Student delete queue entry stuck
If a student delete entry reaches `MAX_RETRIES`, the SyncStatusBar shows the failure count and a Retry button. The principal can see the stuck entry and retry manually. The delete should be re-attempted from the UI as a fallback.

### SSE permanent failure
After 5 consecutive reconnect failures at the max backoff (30 s), the OfflineProvider logs a warning and sets `isOnline = false` in the sync status store. The background poll timer continues to run, so a successful pull will re-establish the connection.

### Pagination cursor loop
If the client is following `nextSince` cursors and the server returns the same cursor twice (edge case: all remaining records have the same `updatedAt`), the sync engine detects the loop by comparing the previous `since` value to the new `nextSince`, breaks the loop, and records the domain as up-to-date.

### PNG icon generation failure
If `sharp` is unavailable or the SVG cannot be rasterised, the icon generation script logs the error and exits with code 1. The CI pipeline should catch this. The fallback is to create minimal 192×192 and 512×512 PNG files using a different tool — the script will include a comment noting this.

---

## Testing Strategy

### Unit Tests (example-based)

- `normDate()` utility: test with full ISO strings, date-only strings, different timezones, and invalid input.
- `studentsStore.remove()`: mock `queueStudentWrite` and verify the method is `"DELETE"` and the body is `null`.
- `flushQueue()`: mock `fetch` and verify that a DELETE entry sends `method: "DELETE"` to the server.
- SSE backoff calculation: given successive failure counts, verify the delay sequence matches `min(1000 * 2^n, 30000)`.
- `StudentTable` with 50 items: verify all 50 rows are in the DOM.
- `StudentTable` with 200 items: verify ≤ 50 rows are in the DOM (virtual rendering active).
- Manifest validation: parse `manifest.json` and verify PNG icon entries exist with correct sizes and types.
- Service worker config: parse `next.config.js` and verify `/api/sync/pull` maps to `NetworkOnly`.

### Property-Based Tests

Property-based tests use **fast-check** (the standard PBT library for TypeScript). Each test runs a minimum of 100 iterations.

- **Property 1 (normDate idempotence):** Generate arbitrary ISO datetime strings using fast-check string generators; verify `normDate(normDate(x)) === normDate(x)` and result matches `/^\d{4}-\d{2}-\d{2}$/`.
- **Property 2 (DELETE method):** Generate arbitrary student IDs; for each, call `remove()` with a mock queue, verify the recorded method is always `"DELETE"`.
- **Property 3 (SSE backoff):** Generate `n` from 1 to 20; verify the computed delay is always `≤ 30000` and the sequence is non-decreasing.
- **Property 4 & 5 (pull pagination):** Mock the Prisma client to return an arbitrarily large dataset; call the pull handler and verify response length ≤ limit and `nextSince` is present when truncated.
- **Property 6 & 7 (virtual list):** Generate student arrays of length N; render `StudentTable`; verify row count in DOM follows the threshold rule.
- **Property 8 (API field exclusion):** Generate mock school/student data; call the GET /api/students handler and verify no response item contains `schoolClass` or `electives` keys.

Tag format for all property tests: **Feature: offline-performance-optimization, Property N: <property_text>**

### Integration Tests

- Full sync cycle on a test database: insert 1,500 attendance records with full ISO timestamps, run sync, verify AttendanceStore returns all records via `forClassDate()`.
- Database index verification: run `EXPLAIN ANALYZE` on the delta pull queries and verify `Index Scan` appears in the plan for each of the four new indexes.
- PWA install eligibility: run Lighthouse PWA audit against the dev server and verify score ≥ 90 with no "manifest does not have a maskable icon" error.

