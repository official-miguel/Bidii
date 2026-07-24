# Bidii Offline-First Architecture

> **Objective:** Deliver a native-app experience on mobile and desktop — near-instant navigation, full offline operation for all core school management features, automatic background sync, and real-time updates when online.
>
> **Current baseline:** Next.js 14 App Router · React 18 · TypeScript · Tailwind CSS · Prisma 5 + PostgreSQL · Custom session-cookie auth · One existing offline module (CBE assessment queue backed by IndexedDB).

---

## 1. Executive Summary

The existing codebase already proves the right instincts: `cbeOfflineQueue.ts` is a clean, production-quality IndexedDB write queue with optimistic-UI in `CbeJuniorGrid.tsx`. The upgrade generalises that pattern system-wide and layers in three additional capabilities:

| Layer | What it adds |
|---|---|
| **PWA shell** | Service worker caches the app shell + API responses so every page opens instantly, even offline |
| **Global offline store** | A single IndexedDB database mirrors server data per school; reads always hit local storage first |
| **Real-time sync** | Server-Sent Events (SSE) push delta updates to every open tab when online |

All AI features continue to require internet. Everything else works offline.

---

## 2. Technology Choices (Rationale)

### 2.1 Service Worker — Workbox (via `next-pwa`)

`next-pwa` wraps Workbox and integrates cleanly with Next.js App Router. It generates a service worker that:

- Caches the compiled JS/CSS app shell (stale-while-revalidate).
- Intercepts API fetches and serves cached responses when offline.
- Registers a `BackgroundSync` queue so any fetch that fails offline is retried automatically when the network returns — zero application code needed for that retry loop.

**Why not a hand-rolled SW?** The existing CBE queue already hand-rolls its own retry loop. Workbox's `BackgroundSync` plugin handles the same problem at the network layer, complementing (not replacing) the IndexedDB queue.

### 2.2 Local Database — `idb` + structured IndexedDB schema

`idb` is a tiny (< 1 kB) typed wrapper around the raw IndexedDB API — the same API already used in `cbeOfflineQueue.ts`. No new abstraction model to learn; the team already knows the pattern.

Choosing `idb` over Dexie, PouchDB, or SQLite-WASM because:

- Zero new mental model for the team.
- Tree-shakeable; adds < 1 kB to the bundle.
- Full TypeScript generics.
- Dexie is the natural upgrade path later if query complexity grows.

### 2.3 Global State — Zustand (minimal, scoped stores)

The app currently has no global state manager. Individual pages use `useState`/`useEffect` to fetch from the API — this pattern breaks offline. Zustand provides:

- A per-module store (students, attendance, library, etc.).
- Hydration from IndexedDB on app load.
- Actions that write to IndexedDB first, then queue a network sync.
- Cross-tab reactivity via `BroadcastChannel`.

### 2.4 Real-Time Updates — Server-Sent Events (SSE)

WebSockets require a persistent connection server upgrade and are harder to scale horizontally. SSE is HTTP/1.1-compatible, works through proxies, and is natively supported in Next.js Route Handlers (via `ReadableStream`). Each authenticated client opens one SSE connection to `/api/events/stream`; the server pushes `{ type, payload }` delta events.

**Conflict resolution:** Last-write-wins using `updatedAt` timestamps, which every Prisma model already has. Operational transforms are not needed for this domain (school records are not collaborative real-time documents like a shared spreadsheet).

---

## 3. Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Tab                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React UI  (Next.js App Router pages)                   │   │
│  │  • Reads from Zustand store (never fetches directly)    │   │
│  │  • Writes → store action → IndexedDB → queue → network  │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │ subscribe                               │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │  Zustand Stores  (one per module)                       │   │
│  │  students | attendance | library | finance | ...        │   │
│  └────────────┬──────────────────────┬─────────────────────┘   │
│               │ persist              │ optimistic write        │
│  ┌────────────▼──────────┐  ┌────────▼────────────────────┐   │
│  │  IndexedDB            │  │  Sync Queue                 │   │
│  │  bidii_local_db       │  │  (per-module write queues)  │   │
│  │  • students           │  │  extends cbeOfflineQueue    │   │
│  │  • attendance         │  │  pattern to all modules     │   │
│  │  • assessmentItems    │  └────────┬────────────────────┘   │
│  │  • libraryBorrows     │           │ flush on online         │
│  │  • feeRecords         │           │                         │
│  │  • ...                │  ┌────────▼────────────────────┐   │
│  └───────────────────────┘  │  Service Worker (Workbox)   │   │
│                              │  • App shell cache          │   │
│  ┌──────────────────────┐   │  • API response cache       │   │
│  │  SSE listener        │   │  • BackgroundSync fallback  │   │
│  │  /api/events/stream  │   └────────────────────────────┘   │
│  │  → merges deltas     │                                      │
│  │    into Zustand      │                                      │
│  └──────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────────┐
│  Next.js Server                                                 │
│  • REST API routes (unchanged, but add ETag + updatedAt headers)│
│  • SSE stream endpoint  /api/events/stream                     │
│  • Sync endpoint        /api/sync/pull  (delta pull on reconnect)│
│  • Prisma → PostgreSQL                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. IndexedDB Schema — `bidii_local_db`

One database per browser profile (school-scoped by the session cookie). Version bumps trigger schema migrations, exactly as Prisma migrations work server-side.

```typescript
// src/lib/offline/db.ts
import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface BidiiDB extends DBSchema {
  // ── Meta ──────────────────────────────────────────────────────
  syncMeta: {
    key: string;                      // storeName
    value: { storeName: string; lastSyncedAt: number };
  };

  // ── Students ──────────────────────────────────────────────────
  students: {
    key: string;                      // Student.id
    value: LocalStudent;
    indexes: {
      "by-school":      string;       // schoolId
      "by-class":       string;       // classId
      "by-admission":   string;       // admissionNumber
      "by-name":        string;       // fullName (for search)
    };
  };

  // ── Attendance ────────────────────────────────────────────────
  attendance: {
    key: string;                      // Attendance.id
    value: LocalAttendance;
    indexes: {
      "by-class-date":  [string, string];  // [classId, date]
      "by-student":     string;
    };
  };

  // ── Assessment items ──────────────────────────────────────────
  assessmentItems: {
    key: string;
    value: LocalAssessmentItem;
    indexes: {
      "by-period-student": [string, string];
      "by-student":        string;
    };
  };

  // ── Library ───────────────────────────────────────────────────
  libraryBooks: {
    key: string;
    value: LocalLibraryBook;
    indexes: { "by-isbn": string; "by-title": string };
  };
  libraryBorrows: {
    key: string;
    value: LocalLibraryBorrow;
    indexes: { "by-student": string; "by-book": string };
  };

  // ── Fee records ───────────────────────────────────────────────
  feeRecords: {
    key: string;
    value: LocalFeeRecord;
    indexes: { "by-student": string; "by-term": string };
  };

  // ── Timetable ─────────────────────────────────────────────────
  timetableSlots: {
    key: string;
    value: LocalTimetableSlot;
    indexes: { "by-class": string; "by-teacher": string };
  };

  // ── Discipline ────────────────────────────────────────────────
  disciplineRecords: {
    key: string;
    value: LocalDisciplineRecord;
    indexes: { "by-student": string };
  };

  // ── Write queues (one per domain) ─────────────────────────────
  writeQueue: {
    key: string;                      // client-generated id
    value: WriteQueueEntry;
    indexes: { "by-domain": string; "by-status": string };
  };
}

export type WriteQueueEntry = {
  id:        string;
  domain:    "attendance" | "assessmentItem" | "libraryBorrow" | "feeRecord" | "discipline" | "student";
  method:    "PUT" | "POST" | "DELETE" | "PATCH";
  url:       string;
  body:      unknown;
  timestamp: number;
  retries:   number;
  status:    "pending" | "stuck";
};
```

All `LocalXxx` types are the server's Prisma response shapes, with an added `_localOnly?: boolean` flag for records created offline that haven't yet received a server-assigned id.

---

## 5. Sync Engine

### 5.1 Delta Pull (reconnect sync)

When the app comes online (or on first load), it calls:

```
GET /api/sync/pull?domain=students&since=<lastSyncedAt>
```

The server returns only rows where `updatedAt > since`, scoped to `schoolId`. The client upserts them into IndexedDB and updates `syncMeta`.

This keeps bandwidth usage proportional to changes, not total data size.

### 5.2 Write Queue Flush

The unified write queue in `bidii_local_db.writeQueue` extends the existing `cbeOfflineQueue` pattern to every domain. On `window.online`:

1. Read all `pending` entries, sorted by `timestamp` (oldest first).
2. Batch by domain + URL.
3. POST to server; on 2xx, delete the entry. On 4xx (permanent error), mark `stuck`. On 5xx / network error, increment `retries` (max 3 → stuck).
4. After flush, run a delta pull to pick up any server-side changes that happened while offline.

### 5.3 Conflict Resolution

All Prisma models carry `updatedAt`. On upsert, the server compares incoming `updatedAt` with the stored `updatedAt`:

- If incoming ≥ stored → accept (last-write-wins).
- If incoming < stored → reject with `409 Conflict`; the sync engine pulls the server version and marks the queue entry resolved.

This is sufficient for school management data. Genuine simultaneous edits to the same record are rare and the "last write wins" outcome is acceptable (e.g., two teachers editing the same attendance row at the same millisecond).

### 5.4 Real-Time SSE Push

```
GET /api/events/stream   (long-lived HTTP connection)
```

Each event:

```json
{ "type": "attendance.updated", "payload": { "id": "...", "status": "PRESENT", ... } }
{ "type": "student.created",    "payload": { ...student fields... } }
{ "type": "libraryBorrow.returned", "payload": { ... } }
```

The SSE listener in the client merges payload into the matching Zustand store slice and upserts into IndexedDB — so the principal's dashboard updates within ~200 ms of the bursar recording a payment.

---

## 6. PWA / Service Worker

Install `next-pwa` (Workbox-based):

```bash
npm install next-pwa
npm install --save-dev @types/next-pwa
```

`next.config.js` additions:

```js
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    // App shell — cache-first
    { urlPattern: /\/_next\/static\//, handler: "CacheFirst",
      options: { cacheName: "next-static", expiration: { maxAgeSeconds: 30 * 24 * 3600 } } },
    // API reads — stale-while-revalidate (serves cached, updates in background)
    { urlPattern: /\/api\/(students|classes|subjects|timetable|library|calendar)/,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "api-reads", expiration: { maxEntries: 200, maxAgeSeconds: 24 * 3600 } } },
    // Write endpoints — NetworkOnly with BackgroundSync fallback
    { urlPattern: /\/api\/(attendance|assessments|discipline|fee)/,
      handler: "NetworkOnly",
      options: {
        backgroundSync: { name: "bidii-writes", options: { maxRetentionTime: 24 * 60 } }
      }
    },
  ],
});
module.exports = withPWA({ /* existing next.config options */ });
```

`public/manifest.json`:

```json
{
  "name": "Bidii School Management",
  "short_name": "Bidii",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e40af",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 7. Zustand Store Architecture

One file per domain. Example — students store:

```typescript
// src/lib/stores/studentsStore.ts
import { create } from "zustand";
import { db } from "@/lib/offline/db";

interface StudentsState {
  students: LocalStudent[];
  loading: boolean;
  hydrate: (schoolId: string) => Promise<void>;
  upsert:  (student: LocalStudent) => Promise<void>;
  remove:  (id: string) => Promise<void>;
  search:  (query: string) => LocalStudent[];
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  students: [],
  loading: true,

  // Called once on app boot — reads from IndexedDB
  async hydrate(schoolId) {
    const all = await db.getAllFromIndex("students", "by-school", schoolId);
    set({ students: all, loading: false });
  },

  // Optimistic write — IndexedDB first, then enqueue network sync
  async upsert(student) {
    await db.put("students", student);
    set((s) => ({
      students: s.students.some((x) => x.id === student.id)
        ? s.students.map((x) => (x.id === student.id ? student : x))
        : [...s.students, student],
    }));
    await enqueueWrite({ domain: "student", method: "PUT",
      url: `/api/students/${student.id}`, body: student });
  },

  search(query) {
    const q = query.toLowerCase();
    return get().students.filter(
      (s) => s.fullName.toLowerCase().includes(q) ||
             s.admissionNumber.toLowerCase().includes(q)
    );
  },
}));
```

The `search()` function runs entirely in memory — no network round trip, no DB read — which is how student search stays under 100 ms even with 5,000 records.

---

## 8. Offline Authentication

The current auth flow requires a database round trip to validate the session token. Offline, that fails. Solution:

1. On successful login, store a **signed offline token** in IndexedDB:
   ```json
   { "userId": "...", "schoolId": "...", "role": "PRINCIPAL",
     "email": "...", "expiresAt": 1753000000000, "sig": "HMAC-SHA256(...)" }
   ```
   Signed with `SESSION_SECRET` (available server-side at login time; the signature is computed server-side and sent to the client as a single opaque blob).

2. The middleware already only checks cookie presence. Layouts call `getCurrentUser()`, which hits the DB. Replace `getCurrentUser()` with a two-path version:
   - If online: existing DB lookup.
   - If offline (or DB unreachable): validate the cached offline token's HMAC signature using a client-side key derived from the session cookie value. If valid and not expired, return the cached user object.

3. Offline tokens expire after 7 days (same as the session TTL), matching the existing `SESSION_TTL_MS`.

4. On reconnect, the session is re-validated with the server silently in the background.

---

## 9. Module-by-Module Offline Strategy

| Module | Read strategy | Write strategy |
|---|---|---|
| **Students** | Hydrate from IndexedDB on app boot | Optimistic + write queue |
| **Attendance** | Cache by class + date range | Optimistic + write queue; SSE push to parent view |
| **Exams / Assessments** | Cache periods + items per student | Existing CBE queue extended; 8-4-4 queue added |
| **Analysis dashboards** | Pre-computed summaries cached in IndexedDB; background re-compute on sync | Read-only; no offline writes |
| **Library** | Full book catalogue + active borrows cached | Issue/return queued; auto-flush on reconnect |
| **Fee records** | Cached per student per term | Write queue; bursar UI shows "pending sync" badge |
| **Timetable** | Cached on first load; rarely changes | Read-only for most users |
| **Calendar** | Cached; Kenya public holidays computed client-side | Edits queued |
| **Discipline** | Cached per student | Write queue |
| **Reports / Result slips** | Pre-generated PDF blobs cached in IndexedDB (up to 50 MB) | Read-only |
| **AI features** | N/A | Show "Requires internet" banner; queue request for auto-retry on reconnect |

---

## 10. Performance Targets and How They Are Met

| Target | Mechanism |
|---|---|
| Student search < 100 ms | In-memory Zustand store; IndexedDB `by-name` index for initial hydration |
| Page navigation < 200 ms | Service worker serves cached shell; Zustand hydrated on app boot |
| Analysis opens instantly | Summaries pre-computed and cached; heavy re-compute runs in a `Web Worker` |
| 5,000 students, smooth scroll | Virtual list (`react-window` or CSS `content-visibility: auto`) |
| 100,000+ exam records | Paginated IndexedDB cursor reads; only current-period records kept hot in memory |
| 60 FPS animations | CSS transitions only; no JS-driven animations on the critical path |
| Low-end Android devices | Bundle < 200 kB initial JS; lazy-load recharts and heavy components |

---

## 11. Implementation Roadmap

### Phase 1 — PWA Shell (1–2 days)
- Add `next-pwa` + Workbox config.
- Add `manifest.json` and app icons.
- Verify offline shell loads from cache.
- Add `<meta name="theme-color">` and viewport meta.

### Phase 2 — Global IndexedDB Schema (2–3 days)
- Install `idb`.
- Create `src/lib/offline/db.ts` with full schema (Section 4).
- Create migration helper for version bumps.

### Phase 3 — Unified Write Queue (1–2 days)
- Generalise `cbeOfflineQueue.ts` into `src/lib/offline/writeQueue.ts`.
- Migrate CBE queue to use the unified queue.
- Add flush-on-online listener in the root layout client component.

### Phase 4 — Zustand Stores + Hydration (3–5 days)
- Install `zustand`.
- Create stores for: students, classes, attendance, assessmentItems, libraryBooks, libraryBorrows, timetable, calendar, discipline.
- Wire hydration calls into the root layout (`useEffect` on mount, once per session).
- Replace direct `fetch()` calls in each page with store reads.

### Phase 5 — Sync API Endpoints (2–3 days)
- Add `GET /api/sync/pull?domain=&since=` route.
- Add `updatedAt` index to heavy-write Prisma models if missing.
- Implement delta pull in the sync engine.

### Phase 6 — SSE Real-Time Push (2–3 days)
- Add `GET /api/events/stream` SSE endpoint.
- Emit events from write API routes after successful DB commits.
- Add SSE listener in the root client layout; wire to store updates.

### Phase 7 — Offline Auth (1–2 days)
- Server signs offline token on login; store in IndexedDB.
- Patch `getCurrentUser()` to fall back to offline token.
- Add 7-day expiry check.

### Phase 8 — Performance & Mobile Polish (2–3 days)
- Add virtual scrolling to student list, exam results table.
- Move heavy analysis computations to `Web Worker`.
- Audit bundle size; lazy-load recharts, PDF renderer.
- Test on a mid-range Android device (Chrome DevTools throttling + network offline).

### Phase 9 — Dark Mode (1 day)
- Add `class="dark"` toggle on `<html>`.
- Add Tailwind `dark:` variants to design tokens.
- Persist preference in `localStorage`.

---

## 12. Security Considerations for Offline Data

- **Encrypted IndexedDB:** Use the Web Crypto API to AES-256-GCM encrypt sensitive fields (student PII, fee amounts) before writing to IndexedDB. The encryption key is derived from the session cookie value using PBKDF2 — so clearing the cookie (logout) makes the cached data unreadable.
- **Offline token integrity:** The HMAC signature on the cached user object prevents tampering with role/schoolId without knowing `SESSION_SECRET`.
- **Data isolation:** IndexedDB is same-origin only. All data is scoped to `schoolId` at the application layer.
- **Audit logs:** Write operations include `userId` and `timestamp`; the server records these on sync even for offline-originated writes.

---

## 13. File Structure (New Files)

```
src/
  lib/
    offline/
      db.ts              ← IndexedDB schema + openDB
      writeQueue.ts      ← Unified write queue (generalises cbeOfflineQueue)
      syncEngine.ts      ← Delta pull + flush orchestration
      offlineAuth.ts     ← Offline token sign/verify helpers
    stores/
      studentsStore.ts
      attendanceStore.ts
      libraryStore.ts
      assessmentStore.ts
      timetableStore.ts
      calendarStore.ts
      disciplineStore.ts
      feeStore.ts
  app/
    api/
      sync/
        pull/route.ts    ← Delta pull endpoint
      events/
        stream/route.ts  ← SSE push endpoint
  components/
    OfflineProvider.tsx  ← Root client component: hydrates stores, starts SSE, starts flush loop
    SyncStatusBar.tsx    ← Global sync badge (replaces per-module SyncBadge)
public/
  manifest.json
  icons/
    icon-192.png
    icon-512.png
```

---

## 14. What Does NOT Change

- The Prisma schema is unchanged. Every new capability is purely additive on the client side.
- Existing API routes are unchanged. The sync engine calls them exactly as pages do today.
- The CBE offline queue continues to work. Phase 3 migrates it to use the unified queue internally without changing its public API.
- Role-based access control is unchanged. The offline layer respects the same `role` / `permissions` the server enforces.
- AI features are unchanged and continue to require internet. The only addition is a graceful "AI requires internet" banner when offline.
