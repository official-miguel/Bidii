# Bidii School Management System

Multi-tenant school management platform for Kenyan schools (8-4-4 and CBE/CBC curricula). A single deployment serves many schools; every record is scoped to a `schoolId` derived from the authenticated session.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, server components + API route handlers) |
| Language | TypeScript 5.5 (strict) |
| Database | PostgreSQL (Neon pooler in production, local Postgres for dev) |
| ORM | Prisma 5 (75 models, SQL migrations in `prisma/migrations/`) |
| Styling | Tailwind CSS 3 |
| Client state | Zustand |
| Charts | Recharts |
| Validation | Zod (every API route validates input) |
| Auth | Custom cookie sessions (bcrypt + SHA-256 token hashes) — no external auth provider |
| Realtime | Server-Sent Events via an in-process `EventEmitter` bus (`src/lib/sse.ts`) |
| AI | Google Gemini via a single centralized client (`src/lib/ai/gemini.ts`) |
| Email | Nodemailer (per-school SMTP, platform SMTP fallback) |
| Tests | Jest + Testing Library + fast-check |

## Getting started

```bash
npm install                 # runs prisma generate via postinstall
cp .env.example .env        # then fill in values (see below)
npx prisma migrate dev      # create/upgrade the database
npm run db:seed             # base seed (npm run db:seed-demo for demo data)
npm run dev                 # http://localhost:3000
```

### Required environment variables

See [.env.example](.env.example) for full documentation of each. The critical ones:

- `DATABASE_URL` — Postgres connection string. With Neon, use the **pooler** endpoint with `pgbouncer=true&connect_timeout=15`, and do **not** include `channel_binding=require` (PgBouncer silently drops those connections).
- `SESSION_SECRET` — signs session cookies.
- `INTEGRATION_ENCRYPTION_KEY` — encrypts each school's own API keys (Gemini, SMS, SMTP) at rest. Back it up; rotating it invalidates all stored school keys.
- `SMTP_*` — optional platform-level fallback for staff one-time-password emails.
- `NEXT_PUBLIC_APP_URL` — public URL used in email links.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run lint` | ESLint (next config) |
| `npm test` / `test:watch` | Jest |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:studio` | Browse the DB |
| `npm run db:seed` / `db:seed-demo` | Seed base data / demo dataset |

## Repository layout

```
prisma/
  schema.prisma        75 models — the authoritative data model
  migrations/          timestamped SQL migrations (never edit applied ones)
  seed.ts, seed-demo.ts
src/
  middleware.ts        Edge middleware: cookie-presence redirect only (no DB access on Edge)
  app/
    api/               186 REST route handlers (route.ts files)
    principal/ teacher/ staff/ parent/  role-scoped page trees (110 pages)
  components/          shared + per-domain UI (assessment/, records/, timetable/, ...)
  lib/                 all business logic — routes stay thin
    auth.ts            sessions: creation, verification, requireRole()
    permissions.ts     module registry + effective-permission resolution
    apiAuth.ts         enforceAuth() helper (see Authorization below)
    prisma.ts          singleton Prisma client
    sse.ts             server-side SSE event bus
    ai/gemini.ts       the only file that talks to the AI provider
    integrations.ts    per-school encrypted API key storage
    assessment/ accommodation/ library/ messaging/ soma-ai/ analytics/ ...
  hooks/               client hooks
  __tests__/           Jest tests
```

## Architecture

### Multi-tenancy — the one invariant that is never optional

Every school-owned table carries `schoolId`. The value is **always derived from the session user**, never read from request params or body. Every query in every route binds it:

```ts
const students = await prisma.student.findMany({
  where: { schoolId: user.schoolId, archivedAt: null },
});
```

There is no cross-school access path anywhere in the codebase. When adding a route, this is the first thing a reviewer checks.

### Authentication

- Passwords: bcrypt cost 12.
- Sessions: 32-byte random token in a cookie (`bidii_session`, 7-day TTL); only the **SHA-256 hash** is stored in the `Session` table, so a DB leak yields no usable tokens.
- `src/middleware.ts` runs on the Edge and only checks cookie *presence* (Prisma can't run there); real verification happens server-side via `getCurrentUser()` (React `cache()`-wrapped) in layouts and routes.
- Base roles (`Role` enum): `PRINCIPAL`, `TEACHER`, `STUDENT`, `PARENT`, `WATCHMAN`, `MARKER`, `ADMIN_STAFF`.

### Authorization — configurable RBAC, not fixed roles

On top of the base role, each school defines its own **staff roles** (`StaffRole`) with per-module, per-action grants (`RolePermission`), assigned via `UserStaffRole`. Effective permissions are resolved in `src/lib/permissions.ts` against the module registry (`MODULE_INFO` — ~24 modules such as `STUDENTS`, `ASSESSMENTS`, `LIBRARY`, `ACCOMMODATION`). Adding a module to `MODULE_INFO` automatically surfaces it in the permission matrix, sidebar nav filtering, and role seeding. Permission changes are written to `PermissionAuditLog`.

Route guard pattern (current convention across the API):

```ts
const user =
  (await requireRole("PRINCIPAL")) ??
  (await requirePermission("STUDENTS", "view"));
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

> Note: `src/lib/apiAuth.ts` documents an `enforceAuth()` pattern that routes do not currently use — the `requireRole`/`requirePermission` chain above is the real convention. Treat `apiAuth.ts` as aspirational until adopted or removed.

### API conventions

- One `route.ts` per resource under `src/app/api/`, exporting `GET`/`POST`/`PATCH`/`DELETE`.
- Zod schema per mutating route; parse before touching the DB.
- List endpoints use **cursor pagination** (`?cursor=`, `X-Next-Cursor` / `X-Total-Count` headers) with clamped page sizes — see `src/app/api/students/route.ts` for the canonical example, including which DB index each search path relies on.
- Multi-step writes use `prisma.$transaction`; hot paths (analytics, rankings) drop to `$queryRaw` with supporting indexes added in dedicated migrations (`*_perf_indexes`, `*_scale_indexes`).
- After a successful write, emit a typed event with `emitSSE()` so open clients update live.

### Realtime (SSE)

`src/lib/sse.ts` is a process-wide `EventEmitter` (survives dev hot-reload via `globalThis`, listener cap 2,000 ≈ 500 users × 4 tabs). Routes emit semantic events (`student.created`, `student.updated`, ...) after DB writes; clients subscribe over an SSE endpoint. **Implication: this only works single-process.** Horizontal scaling requires replacing the bus with a shared broker (e.g. Postgres LISTEN/NOTIFY or Redis pub/sub).

### AI integration

All AI features (timetable generation, TOD rosters, school intelligence, Soma AI assistant, discipline-document summaries) go through `callGemini()`/`generateJson()` in `src/lib/ai/gemini.ts` — structured-output JSON schemas, retries with 429 backoff, per-school response caching, and `AiServiceError.configIssue` to distinguish "fix your key in Settings" from transient failures. Each school supplies its own Gemini key, stored encrypted (`INTEGRATION_ENCRYPTION_KEY`) via `src/lib/integrations.ts`. Swapping providers means changing this one file.

### Domain modules

| Domain | Highlights |
|---|---|
| Assessments | Dual-curriculum: legacy exam marksheets and CBE frameworks (learning areas → strands → sub-strands, competency units → elements → criteria), report cards, rankings, AI insights |
| Timetable | Constraint-based builder + AI generation, teacher unavailability, overrides |
| Library | Catalogue/copies, cards, borrowing, fines with pause/audit trails, reservations, classroom loans, circulation events |
| Accommodation | Dormitories → cubicles → beds → sleeping positions, auto-allocation, inspections, maintenance holds |
| Records | Discipline cases (notes, files, AI summaries) and achievements, split permissions |
| Messaging | Recipient groups, templates, scheduling, per-school delivery settings |
| Attendance, Calendar, Analytics, History | Daily class attendance, school calendar with audiences and Kenyan public holidays, drill-down analytics, archived-record browsing |

## Working on the codebase

- **Migrations**: `npx prisma migrate dev --name descriptive_name`. Never edit an applied migration; add a new one.
- **New module**: add to the `Module` enum + `MODULE_INFO` in `permissions.ts`; nav, permission matrix, and seeding pick it up automatically.
- **Comments**: the codebase documents *why*, not *what* (see `sse.ts`, `gemini.ts`, `.env.example`). Match that standard.
- **Testing**: coverage is currently minimal (2 test files). Highest-value targets for new tests: permission resolution, library fine calculation, CBE grade aggregation. `fast-check` is available for property-based tests.
- **Windows note**: the project is developed on Windows; scripts are cross-platform (npm + ts-node), no bash-only tooling.
