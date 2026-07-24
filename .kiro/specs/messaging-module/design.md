# Design Document: Messaging Module (Communication Centre)

## Overview

The Messaging Module introduces a Communication Centre that is fully greenfield on the database and UI layers, but slots cleanly into every existing system convention. The `COMMUNICATION` module enum value, the `SMS` / `WHATSAPP` / `EMAIL` `IntegrationProvider` entries (with their encrypted-key storage), and the RBAC guard (`requirePermission`) are already present. This design only adds what is missing: database models, API routes, service utilities, UI pages, and offline-cache stores.

The module follows the same architectural pattern as every other module in the system:

- **Server components / layouts** enforce authentication and build the sidebar nav.
- **`"use client"` page components** fetch from API routes via `useEffect` and render from local state.
- **API routes** (Next.js App Router) guard with `requirePermission`, validate with `zod`, query with `prisma`, and return `NextResponse.json`.
- **IndexedDB** (existing `db` utility in `src/lib/offline/`) caches API responses for instant load and powers offline search.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│                                                                          │
│  ┌───────────────────────────┐    ┌───────────────────────────────────┐  │
│  │  /principal/communication │    │  /staff/communication             │  │
│  │  /principal/communication │    │  (MODULE_ROUTES COMMUNICATION)    │  │
│  │    /groups  /templates    │    └──────────────┬────────────────────┘  │
│  └──────────────┬────────────┘                   │                       │
│                 │ fetch()                         │ fetch()               │
│  ┌──────────────▼─────────────────────────────────▼────────────────────┐ │
│  │                    IndexedDB (offline cache)                         │ │
│  │  stores: messages · groups · templates · recipientIndex · outbox     │ │
│  └──────────────┬────────────────────────────────────────────────────  ┘ │
└─────────────────┼────────────────────────────────────────────────────────┘
                  │ HTTP  (Next.js API routes)
┌─────────────────▼────────────────────────────────────────────────────────┐
│  /api/messaging/                                                         │
│    messages/          GET (list) · POST (create draft)                   │
│    send/              POST (dispatch now or queue scheduled)             │
│    messages/[id]/     GET (detail + logs)                                │
│    messages/[id]/retry  POST                                             │
│    messages/[id]/cancel POST                                             │
│    groups/            GET · POST                                         │
│    groups/[id]/       PUT · DELETE                                       │
│    groups/[id]/members  POST · DELETE                                    │
│    templates/         GET · POST                                         │
│    templates/[id]/    PUT · DELETE                                       │
│    recipients/search/ GET  (live search — students + teachers)           │
│    recipients/resolve GET  (expand group/class/form → phone list)        │
│    exam-results/      GET (period summary) · POST (bulk send)            │
│    exam-results/preview/[studentId]  GET                                 │
└─────────────────┬────────────────────────────────────────────────────────┘
                  │ Prisma
┌─────────────────▼────────────────────────────────────────────────────────┐
│  PostgreSQL                                                              │
│    Message · MessageLog · RecipientGroup · GroupMember · MessageTemplate │
│  + existing: Student · Teacher · SchoolClass · AssessmentItem etc.       │
└──────────────────────────────────────────────────────────────────────────┘
                  │ server-side only
┌─────────────────▼────────────────────────────────────────────────────────┐
│  src/lib/messaging/                                                      │
│    dispatch.ts     — provider-agnostic send wrapper                      │
│    resolve.ts      — expand recipient descriptors → phone numbers        │
│    placeholders.ts — substitute /name /class /results etc.               │
│    examResults.ts  — build personalised result message per student       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

The following models are added to `prisma/schema.prisma`. All are scoped to `schoolId` and carry `@@index([schoolId])`.

### `RecipientGroup`

```prisma
/// A school-defined, named collection of recipients (e.g. "Board of Management").
/// Not hardcoded — created and managed entirely by authorised users.
model RecipientGroup {
  id          String        @id @default(cuid())
  schoolId    String
  name        String
  description String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  school      School        @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  members     GroupMember[]
  messages    MessageRecipientGroup[]

  @@unique([schoolId, name])
  @@index([schoolId])
}
```

### `GroupMember`

```prisma
/// One member of a RecipientGroup. Either a system person (teacherId or
/// studentId) OR an external contact (name + phone) — never both.
model GroupMember {
  id        String         @id @default(cuid())
  groupId   String
  /// System-linked teacher/admin staff member (optional)
  teacherId String?
  /// System-linked student (parent contact used as phone) (optional)
  studentId String?
  /// External contact — not in the system (optional)
  extName   String?
  extPhone  String?
  group     RecipientGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  teacher   Teacher?       @relation(fields: [teacherId], references: [id], onDelete: SetNull)
  student   Student?       @relation(fields: [studentId], references: [id], onDelete: SetNull)

  @@index([groupId])
  @@index([teacherId])
  @@index([studentId])
}
```

### `MessageTemplate`

```prisma
/// A reusable named message body with optional placeholder tokens.
model MessageTemplate {
  id        String   @id @default(cuid())
  schoolId  String
  name      String
  category  String?
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  @@unique([schoolId, name])
  @@index([schoolId])
}
```

### `Message`

```prisma
enum MessageChannel {
  SMS
  WHATSAPP
}

enum MessageStatus {
  PENDING
  SENT
  DELIVERED
  FAILED
  CANCELLED
}

/// One outbound communication event. recipientDescriptor is a JSON blob
/// describing who was addressed (e.g. {type:"class",classId:"..."} or
/// {type:"group",groupId:"..."} or [{type:"student",studentId:"..."},...]).
/// Actual phone numbers are resolved at send time and stored only in
/// MessageLog, never here.
model Message {
  id                  String          @id @default(cuid())
  schoolId            String
  senderUserId        String
  channel             MessageChannel
  body                String
  /// JSON — see RecipientDescriptor type in src/lib/messaging/resolve.ts
  recipientDescriptor Json
  /// Human-readable summary stored for the history list (e.g. "Form 3 — 34 recipients")
  recipientSummary    String
  attachmentUrl       String?
  attachmentName      String?
  /// Null = send now (or already sent). Non-null = scheduled for this time.
  scheduledAt         DateTime?
  /// Aggregate status derived from MessageLog rows. Updated by the dispatch
  /// service after each batch completes.
  status              MessageStatus   @default(PENDING)
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  school              School          @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  sender              User            @relation(fields: [senderUserId], references: [id])
  logs                MessageLog[]

  @@index([schoolId])
  @@index([schoolId, createdAt(sort: Desc)])
  @@index([schoolId, status])
  @@index([senderUserId])
}
```

### `MessageLog`

```prisma
/// One row per resolved recipient per message. Tracks delivery at the
/// individual phone-number level. Phone is stored here (not on Message)
/// so history is accurate even if the source record's phone changes later.
model MessageLog {
  id            String        @id @default(cuid())
  messageId     String
  schoolId      String
  channel       MessageChannel
  /// The phone number actually dialled for this log entry.
  phone         String
  /// Human-readable label for display (e.g. student name or teacher name).
  recipientLabel String
  status        MessageStatus @default(PENDING)
  /// Provider-returned message ID for future webhook matching.
  providerMsgId String?
  /// Error detail when status = FAILED.
  errorDetail   String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  message       Message       @relation(fields: [messageId], references: [id], onDelete: Cascade)
  school        School        @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@index([schoolId])
  @@index([schoolId, status])
}
```

### `MessageRecipientGroup` (join table)

```prisma
/// Join table linking a Message to the RecipientGroups it was addressed to
/// (kept for history — group membership may change after sending).
model MessageRecipientGroup {
  messageId String
  groupId   String
  message   Message        @relation(fields: [messageId], references: [id], onDelete: Cascade)
  group     RecipientGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([messageId, groupId])
}
```

### `MessagingSettings`

```prisma
/// Per-school messaging configuration — one row per school, upserted on
/// first save. Stores the closing line for exam-results messages and the
/// batch size for bulk sends.
model MessagingSettings {
  schoolId        String  @id
  resultsClosing  String  @default("Thank you for your continued support.")
  batchSize       Int     @default(50)
  updatedAt       DateTime @updatedAt
  school          School  @relation(fields: [schoolId], references: [id], onDelete: Cascade)
}
```

### Back-relations added to existing models

```prisma
// On School:
messages           Message[]
messageLogs        MessageLog[]
recipientGroups    RecipientGroup[]
messageTemplates   MessageTemplate[]
messagingSettings  MessagingSettings?

// On User:
sentMessages       Message[]

// On Teacher:
groupMemberships   GroupMember[]

// On Student:
groupMemberships   GroupMember[]
```

---

## Migration

A single migration file is created at:

```
prisma/migrations/20260722200000_add_messaging_module/migration.sql
```

It creates all six new tables, their indexes, and the `MessageChannel`, `MessageStatus` enums (PostgreSQL `CREATE TYPE`). No existing tables are altered — back-relation columns are virtual in Prisma; no SQL column additions needed.

---

## Service Layer — `src/lib/messaging/`

### `resolve.ts`

Expands a `RecipientDescriptor[]` (JSON stored on `Message.recipientDescriptor`) into an array of `{ label: string; phone: string }` records, querying Prisma at resolve time so phone numbers are always fresh.

```ts
export type RecipientDescriptor =
  | { type: "student";    studentId: string }
  | { type: "teacher";    teacherId: string }
  | { type: "class";      classId: string }      // → all student parentContacts
  | { type: "form";       form: number }          // → all classes with that form
  | { type: "group";      groupId: string }
  | { type: "allParents"  }
  | { type: "allTeachers" }
  | { type: "allStaff"    }
  | { type: "school"      }
  | { type: "external";   phone: string; label: string }

export async function resolveRecipients(
  descriptors: RecipientDescriptor[],
  schoolId: string
): Promise<{ label: string; phone: string }[]>
```

Deduplicates by phone number to prevent double-sends when a recipient appears in multiple descriptors. Returns only entries where `phone` is non-null and non-empty; skipped entries are returned in a parallel `skipped: { label: string; reason: string }[]` array.

### `placeholders.ts`

```ts
export type PlaceholderContext = {
  name?:      string   // student full name or teacher full name
  class?:     string   // SchoolClass.name
  stream?:    string   // extracted stream portion of class name
  Admission?: string   // Student.admissionNumber
  staffname?: string   // Teacher.fullName
  staffno?:   string   // Teacher.staffId
  results?:   string   // formatted multi-line results block
}

export function applyPlaceholders(body: string, ctx: PlaceholderContext): string
```

Replaces `/name`, `/class`, `/stream`, `/Admission`, `/staffname`, `/staffno`, `/results` tokens. Any token without a corresponding context value is replaced with `[unknown]`.

### `dispatch.ts`

Provider-agnostic send wrapper. Reads the school's integration key via `getSchoolIntegrationKey`, constructs the provider request, and returns a `DispatchResult`.

```ts
export type DispatchResult = {
  phone:         string
  providerMsgId: string | null
  status:        "SENT" | "FAILED"
  errorDetail?:  string
}

export async function dispatchMessage(
  schoolId:  string,
  channel:   MessageChannel,
  phone:     string,
  body:      string
): Promise<DispatchResult>
```

The actual HTTP call to the SMS/WhatsApp provider is abstracted behind an `adapter` interface, making it easy to swap or add providers without changing the calling code. For this version, adapters for **Africa's Talking** (SMS) and **Twilio / 360dialog** (WhatsApp) are stubs that can be filled in with the school's specific provider; the `metadata` field on `SchoolIntegration` stores provider-specific config (e.g. sender ID, from-number).

### `examResults.ts`

```ts
export async function buildResultsMessage(
  studentId:  string,
  periodId:   string,
  schoolId:   string,
  closing:    string
): Promise<{ body: string; recipientLabel: string; phone: string | null }>
```

Fetches the student's published `AssessmentItem` rows for the period, formats them into the `/results` placeholder block (subject, marks/grade for 8-4-4; strand/competency level for CBE), resolves the parent contact, and applies all placeholders using `applyPlaceholders`.

---

## API Routes

All routes live under `src/app/api/messaging/` and follow the standard pattern: `requirePermission` guard → `zod` parse → `prisma` query → `NextResponse.json`.

### `GET /api/messaging/messages`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Query params: `page` (default 1), `q` (search string), `status`, `dateFrom`, `dateTo`
- Returns: `{ messages: MessageSummary[]; total: number }` — 20 per page, ordered by `createdAt DESC`
- `MessageSummary` includes `id`, `channel`, `status`, `recipientSummary`, `body` (truncated to 120 chars), `createdAt`, `scheduledAt`, `sender.email`

### `GET /api/messaging/messages/[id]`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Returns: full `Message` row + all `MessageLog` rows with status and label

### `POST /api/messaging/send`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Body: `{ descriptors: RecipientDescriptor[]; channel: MessageChannel; body: string; scheduledAt?: string; attachmentUrl?: string; attachmentName?: string }`
- Validation: body non-empty, at least one descriptor, channel is configured for school
- On immediate send:
  1. Creates `Message` row with `status: PENDING`
  2. Returns `202 Accepted` with `{ messageId }`
  3. Resolves recipients, dispatches via `dispatch.ts` in batches of `MessagingSettings.batchSize`
  4. Creates `MessageLog` rows with results
  5. Updates `Message.status` to `SENT` or `FAILED` (FAILED if all logs failed)
- On scheduled send: creates `Message` with `scheduledAt` set; dispatch is handled by `GET /api/messaging/scheduled-flush` (a Next.js cron route)

### `POST /api/messaging/messages/[id]/retry`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Re-dispatches only `MessageLog` rows with `status: FAILED` for this message
- Returns `202 Accepted`

### `POST /api/messaging/messages/[id]/cancel`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Only allowed when `Message.status = PENDING` and `scheduledAt` is in the future
- Sets `Message.status = CANCELLED`

### `GET /api/messaging/groups`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Returns all `RecipientGroup` rows for the school with `_count: { members: true }`

### `POST /api/messaging/groups`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Body: `{ name: string; description?: string }`
- Returns created group (HTTP 201)

### `PUT /api/messaging/groups/[id]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`, verifies `group.schoolId === user.schoolId`
- Body: `{ name?: string; description?: string }`

### `DELETE /api/messaging/groups/[id]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Blocks if any scheduled `Message` still references this group via `MessageRecipientGroup`

### `POST /api/messaging/groups/[id]/members`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Body: `{ teacherId?: string } | { studentId?: string } | { extName: string; extPhone: string }`

### `DELETE /api/messaging/groups/[id]/members/[memberId]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`

### `GET /api/messaging/templates`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Returns all `MessageTemplate` rows for the school

### `POST /api/messaging/templates`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Body: `{ name: string; category?: string; body: string }`

### `PUT /api/messaging/templates/[id]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`

### `DELETE /api/messaging/templates/[id]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`

### `GET /api/messaging/recipients/search`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Query: `q` (min 1 char), `limit` (default 15)
- Searches `Student.fullName`, `Teacher.fullName` using `contains` (case-insensitive)
- Returns `{ students: ...; teachers: ... }` — used by the live search picker

### `GET /api/messaging/recipients/resolve`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Query: `descriptors` (JSON-encoded array)
- Returns `{ resolved: { label; phone }[]; skipped: { label; reason }[] }`
- Used by the Composer's preview pane to show resolved count before send

### `GET /api/messaging/exam-results`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Query: `periodId`
- Returns `{ totalStudents; withContact; withoutContact; period: { name; ... } }`

### `GET /api/messaging/exam-results/preview/[studentId]`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Query: `periodId`
- Returns `{ body: string; recipientLabel: string; phone: string | null }` — the fully rendered message for this student

### `POST /api/messaging/exam-results`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Body: `{ periodId: string; channel: MessageChannel; closingLine?: string }`
- Creates one `Message` row per student (or one batch `Message` row) and streams progress via SSE or stores progress in a DB row polled by the client
- Returns `202 Accepted` with `{ batchId }`

### `GET /api/messaging/exam-results/progress/[batchId]`

- Guard: `requirePermission('COMMUNICATION', 'view')`
- Returns `{ sent; total; failed; done: boolean }`

### `GET /api/messaging/scheduled-flush`

- Not protected by RBAC — triggered by Vercel/Next.js cron (`vercel.json` `crons` array or a scheduled route)
- Finds all `Message` rows with `status: PENDING` and `scheduledAt <= now()` and dispatches them

### `GET /api/messaging/settings` / `PUT /api/messaging/settings`

- Guard: `requirePermission('COMMUNICATION', 'manage')`
- Upserts `MessagingSettings` for the school

---

## IndexedDB Stores (offline cache)

Extends the existing `src/lib/offline/db.ts` with new stores:

| Store name              | Key path     | Contents |
|-------------------------|--------------|----------|
| `messaging_messages`    | `id`         | `MessageSummary[]` — list-view data, refreshed on load |
| `messaging_groups`      | `id`         | All `RecipientGroup` rows + member count |
| `messaging_templates`   | `id`         | All `MessageTemplate` rows |
| `messaging_recipients`  | `id`         | Flattened student + teacher lookup table for live search |
| `messaging_outbox`      | `localId`    | Queued outgoing messages (offline queue) |

`messaging_recipients` is built once (or on a background sync) from `/api/students?fields=id,fullName,classId` and `/api/teachers?fields=id,fullName,staffId` — no new API needed, just an additional projection of existing routes. It is indexed by `name` (lowercased) for fast prefix search without network.

---

## Page and Component Structure

```
src/
  app/
    principal/
      communication/
        page.tsx                  ← MessagesTab (default landing)
        groups/
          page.tsx                ← GroupsTab
        templates/
          page.tsx                ← TemplatesTab
        exam-results/
          page.tsx                ← ExamResultsPage
    staff/
      communication/
        page.tsx                  ← same MessagesTab, permission-filtered
        groups/page.tsx
        templates/page.tsx
        exam-results/page.tsx

  components/
    messaging/
      CommunicationShell.tsx      ← tab nav (Messages / Groups / Templates) + layout
      MessageList.tsx             ← searchable, paginated history list
      MessageDetail.tsx           ← full message + log table slide-over
      Composer.tsx                ← slide-over / full-page composer
      RecipientPicker.tsx         ← quick-chips + live search + selected chips
      TemplateSelector.tsx        ← dropdown of saved templates
      GroupManager.tsx            ← groups list + create/edit/delete
      GroupMemberPanel.tsx        ← member list + add/remove for one group
      TemplateEditor.tsx          ← template create/edit form with placeholder highlighting
      ExamResultsPanel.tsx        ← period selector + summary + preview + bulk send
      ExamResultsProgress.tsx     ← progress bar + polling + completion summary
      DeliveryStatusBadge.tsx     ← PENDING/SENT/DELIVERED/FAILED chip
      ChannelBadge.tsx            ← SMS / WhatsApp icon chip
      OfflineQueueBanner.tsx      ← "N messages queued" banner
```

### `CommunicationShell.tsx`

Renders the three-tab navigation bar (Messages, Groups, Templates) and the **New Message** button. Checks `canManage` from a prop passed down by the page layout to conditionally show write actions. On mobile, the tab bar collapses to a horizontal scroll strip.

### `MessageList.tsx`

- Loads from `messaging_messages` IndexedDB store immediately on mount.
- Fires `GET /api/messaging/messages` in the background and merges results.
- Renders rows: channel badge, recipient summary, truncated body, relative time, status badge.
- Search input debounced at 150 ms, filters the local cache first; falls back to API query for text not matched locally.
- "Load more" button appends the next page.

### `Composer.tsx`

- Rendered as a `<dialog>` / overlay panel.
- Embeds `<RecipientPicker>`, `<TemplateSelector>`, the body textarea, channel radio, schedule toggle + date-time picker, and the character counter.
- Live preview pane calls `GET /api/messaging/recipients/resolve` (debounced, 500 ms) and renders the resolved first-recipient preview.
- On submit: calls `POST /api/messaging/send`; on network failure writes to `messaging_outbox` IndexedDB and shows `<OfflineQueueBanner>`.

### `RecipientPicker.tsx`

- Quick-select chips rendered from a static config object plus the school's `RecipientGroup` list (loaded from IndexedDB).
- Search input: queries `messaging_recipients` IndexedDB store (name prefix match) for instant results, fires `GET /api/messaging/recipients/search?q=` as a fallback for names not in cache.
- Selected recipients stored in component state as `RecipientDescriptor[]`.
- Chips above the input are dismissible; selecting "Entire School" calls `setDescriptors([{ type: "school" }])` and clears others.

### `ExamResultsPanel.tsx`

- Fetches assessment periods from the existing `/api/assessments/periods` route.
- On period select, fetches `GET /api/messaging/exam-results?periodId=...` for the summary.
- Preview button opens a modal showing `GET /api/messaging/exam-results/preview/[studentId]` for a selected student.
- "Send All Results" → `POST /api/messaging/exam-results` → polls `GET /api/messaging/exam-results/progress/[batchId]` every 2 s → renders `<ExamResultsProgress>`.

---

## Navigation Wiring

### Principal layout (`src/app/principal/layout.tsx`)

Add to the `NAV` array:

```ts
{ href: '/principal/communication', label: 'Communication' },
```

Positioned after `{ href: '/principal/library', label: 'Library' }`.

### Staff portal layout (`src/app/staff/layout.tsx`)

Add to `MODULE_ROUTES`:

```ts
COMMUNICATION: '/staff/communication',
```

Add to the label mapping within the `nav` build:

```ts
href === '/staff/communication' ? 'Communication' : ...
```

---

## Permissions Matrix Summary

| Action | Required permission |
|---|---|
| View message history | `COMMUNICATION` canView |
| View groups list | `COMMUNICATION` canView |
| View templates list | `COMMUNICATION` canView |
| Create / edit / delete group | `COMMUNICATION` canManage |
| Add / remove group member | `COMMUNICATION` canManage |
| Create / edit / delete template | `COMMUNICATION` canManage |
| Compose and send message | `COMMUNICATION` canManage |
| Schedule message | `COMMUNICATION` canManage |
| Cancel / retry message | `COMMUNICATION` canManage |
| Send exam results | `COMMUNICATION` canManage |
| Edit messaging settings | `COMMUNICATION` canManage |

The `COMMUNICATION` module is already seeded with `canView: true, canManage: true` for the default Secretary role and `canView: true, canManage: false` for the default Accountant role in `src/lib/permissions.ts`. No changes needed to the seeding logic.

---

## Offline Strategy

The offline layer reuses the existing `src/lib/offline/db.ts` pattern:

1. On first load, the Communication Centre pages call the relevant API routes and write responses into the five new IndexedDB stores.
2. On subsequent loads (including offline), the page renders immediately from IndexedDB; a background `fetch` runs and patches the store if online.
3. The `messaging_outbox` store acts as the offline send queue. The existing `online` event listener in `src/lib/offline/sync.ts` (or a new `messagingSync.ts`) flushes the outbox on reconnect.
4. Scheduled messages bypass the outbox — they are written to the server before the user goes offline, and the server dispatches them regardless of client state.

---

## Security Considerations

- All API routes enforce `schoolId` scoping — every Prisma query includes `where: { schoolId: user.schoolId }`.
- Resolved phone numbers are stored in `MessageLog` (history) but never returned to the client in bulk — the message detail view shows labels (names), not raw phone numbers, for privacy.
- Exam results dispatch explicitly verifies at build time that each `AssessmentItem.studentId` belongs to the requesting school before inclusion.
- The `POST /api/messaging/exam-results` route sets a per-student isolation check: only the student's own results are included in their parent's message (enforced by scoping the Prisma query to `studentId`).
- External group members (non-system contacts) store phone numbers in `GroupMember.extPhone`; these are never exposed in list API responses — only used at dispatch time server-side.
