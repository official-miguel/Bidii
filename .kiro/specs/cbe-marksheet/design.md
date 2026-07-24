# Design Document: Stage 2 — CBE Marksheet / Entry

## Overview

This document describes the full technical design for Stage 2 of the assessment system — CBE entry for both Junior (sub-strand / performance level) and Senior Pathway (SBA + exam, weighted numeric) models.

Stage 1 (8-4-4) is complete and validated. Stage 2 is additive: no Stage 1 code changes except the teacher marksheet router, which gains a framework-aware branch.

---

## 1. Schema Changes

### 1.1 `SchoolClass.frameworkType`

Add one column to `SchoolClass`:

```sql
ALTER TABLE "SchoolClass"
  ADD COLUMN IF NOT EXISTS "frameworkType" "FrameworkType" NOT NULL DEFAULT 'EIGHT_FOUR_FOUR';
```

Prisma schema addition:

```prisma
model SchoolClass {
  ...
  frameworkType   FrameworkType  @default(EIGHT_FOUR_FOUR)
  ...
}
```

All existing classes silently become `EIGHT_FOUR_FOUR`. No data loss.

### 1.2 `PathwayWeight` (new table)

Stores the SBA/exam weighting and maximum marks for each subject in a Senior CBE framework.

```prisma
model PathwayWeight {
  id          String              @id @default(cuid())
  schoolId    String
  frameworkId String
  subjectId   String
  sbaWeight   Float               @default(0.6)
  examWeight  Float               @default(0.4)
  sbaMaxMarks Float               @default(100)
  examMaxMarks Float              @default(100)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  school      School              @relation(...)
  framework   AssessmentFramework @relation(...)
  subject     Subject             @relation(...)

  @@unique([frameworkId, subjectId])
  // CHECK: sbaWeight + examWeight = 1.0 (migration SQL only)
}
```

### 1.3 Migration file

New migration: `20260719000000_add_cbe_class_framework_and_pathway_weight`

Contents:
1. `ALTER TABLE "SchoolClass" ADD COLUMN ...` (Req 1.6)
2. `CREATE TABLE "PathwayWeight" ...` with CHECK constraint `sbaWeight + examWeight = 1.0`
3. Add `School` → `PathwayWeight` back-relation index

---

## 2. Framework Router (teacher marksheet page)

`src/app/teacher/assessments/marksheet/page.tsx` currently always renders `MarksheetGrid`. After this change:

```
selectedClass.frameworkType
  EIGHT_FOUR_FOUR → MarksheetGrid (unchanged)
  CBE             → detect sub-type:
                      has learningAreas in active CBE framework → CbeJuniorGrid
                      has competencyUnits                        → CbePathwayGrid
                      fallback                                   → CbeJuniorGrid
```

The framework type check is a server-side Prisma query — never a client-side condition.

Same router logic applies to `src/app/principal/assessments/marksheet/page.tsx`.

---

## 3. CBE Grading Utility — `src/lib/assessment/gradingCbe.ts`

Pure functions, no Prisma, safe for client and server.

```typescript
export type PerformanceLevel = 'EE' | 'ME' | 'AE' | 'BE';

/** Numeric value for aggregation. NYE (null) is excluded from means. */
export const LEVEL_POINTS: Record<PerformanceLevel, number> = {
  EE: 4, ME: 3, AE: 2, BE: 1,
};

/** Human-readable label. */
export const LEVEL_LABELS: Record<PerformanceLevel, string> = {
  EE: 'Exceeds Expectation',
  ME: 'Meets Expectation',
  AE: 'Approaches Expectation',
  BE: 'Below Expectation',
};

/** Tailwind colour classes per level (bg + text). */
export function levelColour(level: PerformanceLevel): { bg: string; text: string }

/** Mean attainment (1–4 scale) from an array of levels, excluding nulls. */
export function meanAttainment(levels: (PerformanceLevel | null)[]): number | null

/** Order: EE > ME > AE > BE. */
export const ALL_LEVELS: PerformanceLevel[] = ['EE', 'ME', 'AE', 'BE'];
```

---

## 4. API Routes — `/api/assessments/cbe/`

### 4.1 `GET /api/assessments/cbe/learning-areas`

Returns the full hierarchy for the school's active CBE framework.

**Response:**
```typescript
{
  frameworkId: string;
  learningAreas: Array<{
    id: string; name: string; code: string | null;
    strands: Array<{
      id: string; name: string; sortOrder: number;
      subStrands: Array<{ id: string; name: string; sortOrder: number }>
    }>
  }>
}
```

**Guard:** any authenticated assessment actor (same as periods endpoint).

### 4.2 `GET /api/assessments/cbe/substrand-sheet`

Query params: `periodId`, `classId`, `subStrandId`

**Response:**
```typescript
{
  period: { id, name, academicYear, term },
  subStrand: { id, name, strand: { name }, learningArea: { name } },
  schoolClass: { id, name },
  rows: Array<{
    student: { id, fullName, admissionNumber };
    level: PerformanceLevel | null;   // null = Not_Yet_Entered
    comment: string | null;
  }>
}
```

**Guard:** `canViewMarksheet(actor)` for CBE scope.

### 4.3 `PUT /api/assessments/cbe/item`

Upsert or delete one CBE assessment item.

**Body:**
```typescript
{
  periodId:   string;
  studentId:  string;
  subStrandId: string;           // junior CBE
  // criterionId: string;        // senior CBE (future — not in this stage)
  level: PerformanceLevel | null; // null = delete row
  comment?: string | null;
}
```

- `level = null` → `deleteMany({ where: { studentId, periodId, subStrandId } })`
- `level` is a value → `upsert` on `item_substrand` unique constraint
- `resultKind = PERFORMANCE_LEVEL`

**Guard:** `canEnterMarks(actor, learningAreaId)` — resolved server-side from the subStrandId's parent chain.

### 4.4 `POST /api/assessments/cbe/batch`

Batch upsert/delete. Used by batch-entry mode and the offline sync flush.

**Body:**
```typescript
{
  subStrandId: string;   // all items in this batch share one sub-strand
  items: Array<{
    periodId:  string;
    studentId: string;
    level:     PerformanceLevel | null;
    comment?:  string | null;
  }>
}
```

Validates all items before writing any. Single `$transaction`. Max 200 items per call.

**Response:** `{ ok: true; count: number }` or `{ error: "VALIDATION_ERROR"; items: [...] }`

---

## 5. Offline Sync — `src/lib/assessment/cbeOfflineQueue.ts`

A thin client-side module (no server imports) wrapping IndexedDB.

```typescript
export interface QueueEntry {
  id:          string;       // cuid generated client-side
  subStrandId: string;
  periodId:    string;
  studentId:   string;
  level:       PerformanceLevel | null;
  comment:     string | null;
  timestamp:   number;
  retries:     number;       // incremented on each failed flush attempt
  status:      'pending' | 'stuck';
}

export async function enqueue(entry: Omit<QueueEntry, 'id' | 'timestamp' | 'retries' | 'status'>): Promise<void>
export async function flush(subStrandId: string): Promise<{ synced: number; stuck: number }>
export async function pendingCount(): Promise<number>
export async function clearSynced(): Promise<void>
```

**DB name:** `bidii_cbe_queue`, **store:** `entries`, **keyPath:** `id`.

The flush function groups queued entries by subStrandId and calls `POST /api/assessments/cbe/batch` for each group. On success, entries are deleted from the store. On failure, `retries` is incremented; entries with `retries >= 3` are set to `status = 'stuck'`.

---

## 6. `CbeJuniorGrid` Component — `src/components/assessment/CbeJuniorGrid.tsx`

Client component (`'use client'`).

### Props

```typescript
interface CbeJuniorGridProps {
  classes:      { id: string; name: string }[];
  defaultClassId?: string;
  lockClass?:   boolean;
  readOnly?:    boolean;
}
```

### Layout

```
┌─ Selectors ──────────────────────────────────────────────────────┐
│  Period ▼    Learning Area ▼    Strand ▼    Sub-Strand ▼         │
└──────────────────────────────────────────────────────────────────┘
┌─ Sync badge (shown when queue.pending > 0) ──────────────────────┐
│  ⟳  12 entries pending sync   [Retry]                           │
└──────────────────────────────────────────────────────────────────┘
┌─ Batch bar ──────────────────────────────────────────────────────┐
│  Mark all as: [EE] [ME] [AE] [BE]    [Clear all]                │
└──────────────────────────────────────────────────────────────────┘
┌─ Student grid ───────────────────────────────────────────────────┐
│ Adm.No  Name              EE    ME    AE    BE   💬              │
│ 1001    Alice Mwangi      ○     ●     ○     ○    ✎              │
│ 1002    Brian Otieno      ○     ○     ○     ○    +              │ ← NYE
│ ...                                                              │
├─ Footer ─────────────────────────────────────────────────────────┤
│  EE: 5  ME: 12  AE: 3  BE: 1  NYE: 4                           │
└──────────────────────────────────────────────────────────────────┘
```

### State

```typescript
// Local pending state (applied optimistically before sync confirmation)
type RowState = {
  level:   PerformanceLevel | null;  // null = NYE
  comment: string | null;
  dirty:   boolean;
  saving:  boolean;
  error:   string | null;
};
// Key: studentId
const [rows, setRows] = useState<Map<string, RowState>>(new Map());
```

### Write flow

1. Teacher taps a level button (or "Clear")
2. `setRows` applies the change optimistically
3. `enqueue(entry)` writes to IndexedDB
4. If `navigator.onLine`: call `PUT /api/assessments/cbe/item` immediately
5. If offline: leave in queue, show sync badge
6. On API success: mark row as `dirty = false`
7. On API failure: leave in queue, increment retries if applicable

The "Mark all as" batch bar calls `POST /api/assessments/cbe/batch` directly (all items online) and also bulk-enqueues to the sync queue.

---

## 7. `CbePathwayGrid` Component — `src/components/assessment/CbePathwayGrid.tsx`

Client component. Reuses `MarksheetGrid`'s input cell and save-bar pattern but adds:

- Two numeric columns per subject: SBA and Exam
- A read-only "Weighted %" column computed client-side: `(sba/sbaMax)*sbaW + (exam/examMax)*examW`
- Weight labels in column headers (e.g. "SBA ×60%")
- Same batch-save via `POST /api/assessments/marksheet/batch` (numeric items, different scope columns)
- PathwayWeight fetched at load time from `GET /api/assessments/cbe/pathway-weights?classId=…`

---

## 8. `CbeDashboard` Component — `src/components/assessment/CbeDashboard.tsx`

Client component. Fetches from `GET /api/assessments/cbe/dashboard?periodId=&classId=`.

Sub-sections:
- **Attainment distribution**: one stacked bar per sub-strand (EE/ME/AE/BE/NYE counts)
- **Learning area summary**: mean attainment score (1–4 scale) per area
- **Student attainment table**: rows = students, columns = sub-strands, cells = level badge

---

## 9. Pages

### 9.1 Principal pages

```
src/app/principal/assessments/
  marksheet/page.tsx      ← add CBE routing branch (no new page)
  dashboard/page.tsx      ← add CBE dashboard branch
  pathway-weights/page.tsx  ← new: configure SBA/exam weights per subject
```

### 9.2 Teacher pages

```
src/app/teacher/assessments/
  marksheet/page.tsx      ← add CBE routing branch (no new page)
```

No new pages required for teachers — the existing marksheet URL shows the right grid automatically.

---

## 10. Admission Form Changes

`src/app/principal/students/page.tsx` — add a read-only "Framework" label next to the class/stream selector.
`src/app/api/classes/route.ts` — return `frameworkType` in GET response.
`src/app/principal/classes/page.tsx` — add framework selector to the "Create class" form.
`src/app/api/classes/route.ts` (POST) — accept and store `frameworkType`.

---

## 11. Data Flow Diagram

```
Teacher (browser)
    │
    ├── tap level → CbeJuniorGrid
    │       │
    │       ├── enqueue(entry)  →  IndexedDB (cbe_sync_queue)
    │       │
    │       └── navigator.onLine?
    │               YES → PUT /api/assessments/cbe/item  → AssessmentItem (PERFORMANCE_LEVEL)
    │               NO  → show sync badge; wait for 'online' event
    │                           └── flush() → POST /api/assessments/cbe/batch
    │
    └── offline sync restores on 'online' event automatically
```

---

## 12. Correctness Properties

**Property 1 — Genuine BE preservation**
Saving `level = BE` and fetching the substrand-sheet SHALL return `level = BE` (not `null`) for that student.

**Property 2 — Not_Yet_Entered vs BE distinction**
After `level = null` is saved (delete), the substrand-sheet SHALL return `level = null`, which SHALL render as all-ghost buttons — not as BE.

**Property 3 — Offline queue durability**
If the page is refreshed after 5 entries are made offline, the queue SHALL still contain those 5 entries on next load.

**Property 4 — Batch equivalence**
Saving 10 items via `POST /batch` SHALL produce identical database state as saving each via 10 individual `PUT /item` calls.

**Property 5 — Pathway weighted % correctness**
For any (sbaScore, examScore, sbaWeight, examWeight, sbaMaxMarks, examMaxMarks), the displayed "Weighted %" SHALL equal `(sbaScore/sbaMaxMarks)*sbaWeight*100 + (examScore/examMaxMarks)*examWeight*100` to within 0.1%.
