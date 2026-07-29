# Database Migration: Neon → Supabase

**Status:** planned
**Scope decision:** Supabase is adopted as the **Postgres host only**. Prisma remains the
data-access layer and the single migration authority. `supabase-js`, PostgREST, RLS, and
Supabase Auth are explicitly **out of scope** — see "What does NOT change" below.

## Why

Platform consolidation: one project to host the database today, Supabase Storage for
student/discipline files next (replacing `StudentFile.data Bytes` in Postgres), and
candidate services (push, realtime) for the planned mobile companion app. The database
move itself is a host swap — both Neon and Supabase are managed Postgres.

## What does NOT change

- **All application code.** 237 files import the Prisma client (921 query call sites,
  45 `$transaction` sites, 168 raw-SQL sites). None are touched.
- **Prisma schema & migrations.** Prisma stays the single migration authority. The
  `supabase/migrations/` folder contains only **generated** SQL (baseline derived from
  `schema.prisma` + a raw-SQL supplement) so the Supabase CLI can build the schema —
  never hand-written migrations. See `supabase/migrations/README.md`.
- **Auth.** Custom cookie sessions live in our own `Session` table; they move with the
  data. Supabase Auth is not used.
- **Authorization.** RBAC stays in the API layer (`src/lib/permissions.ts`). No RLS
  policies are created.
- **SSE, AI integration, email** — all unaffected.

The only artifacts that change: environment variables, `prisma/schema.prisma` datasource
block (one line added), and `.env.example` documentation.

## Changes to make

### 1. Supabase project

Create one project (region: closest to users — `eu-central` or the nearest available to
Kenya; check latency vs current Neon region). Production tier: **Pro** — free-tier
projects pause when idle, which is unacceptable for a school system.

### 2. Connection strings — the part that must be exact

Supabase exposes two endpoints; we need both:

| Purpose | Endpoint | Port | Notes |
|---|---|---|---|
| App runtime (`DATABASE_URL`) | Supavisor pooler `aws-x-<region>.pooler.supabase.com` | **6543** (transaction mode) | Requires `pgbouncer=true` so Prisma disables prepared statements — same requirement as our Neon PgBouncer setup |
| Migrations (`DIRECT_URL`) | Direct `db.<ref>.supabase.co` or pooler session mode | **5432** | `prisma migrate deploy` needs session-level features the transaction pooler doesn't provide |

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-x-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&connect_timeout=15"
DIRECT_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
```

Caveats carried over / new:

- **IPv4:** the *direct* endpoint is IPv6-only unless the IPv4 add-on is enabled. The
  pooler endpoint supports IPv4. If the deploy platform (e.g. Vercel) is IPv4-only, all
  runtime traffic must use the pooler (it should anyway), and migrations run from a
  machine with IPv6 or use the session-mode pooler (port 5432 on the pooler host).
- The Neon-specific warning about `channel_binding=require` no longer applies, but keep
  `pgbouncer=true` — same class of problem, same fix.
- `DATABASE_POOL_SIZE` semantics are unchanged (Supavisor fans out like PgBouncer did).

### 3. Schema/config edits

- `prisma/schema.prisma` — add `directUrl` to the datasource:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```
- `prisma.config.ts` — point the CLI datasource at `DIRECT_URL` (it currently reads
  `DATABASE_URL`; migrate status/deploy should use the direct connection).
- `.env.example` — replace the Neon section with the Supabase two-URL setup above,
  keeping the explanatory comments style.

### 4. Extensions

`20260723000000_scale_indexes` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` (trigram
GIN indexes for name search). `pg_trgm` is on Supabase's allowed extension list and the
`postgres` role may create it — no action needed, but **verify after migrate deploy**
(step 6). Note the Supabase `postgres` role is not a superuser; if any future migration
needs a non-allowlisted extension, it will fail loudly rather than silently.

## Migration procedure

Neon remains untouched throughout — it is the rollback path.

### Phase 1 — dry run (no downtime, any time)

1. Create the Supabase project; capture both connection strings.
2. Build the schema. **Note:** `prisma migrate deploy` alone does NOT work on an empty
   database — the base tables (`School`, `User`, `Student`, ...) predate the migrations
   folder (created via `db push` before history began). Instead apply the generated
   files in `supabase/migrations/` (baseline + raw-SQL supplement — see the README
   there), then baseline Prisma's history so future `migrate deploy` runs work:
   ```
   psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/20260729000000_baseline_schema.sql
   psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/20260729000001_raw_sql_supplement.sql
   for m in prisma/migrations/2*/; do npx prisma migrate resolve --applied "$(basename $m)"; done
   ```
3. Copy data: `pg_dump` from Neon → restore to Supabase:
   ```
   pg_dump "$NEON_URL" --data-only --no-owner --no-privileges \
     --exclude-table=_prisma_migrations > data.sql
   psql "$SUPABASE_DIRECT_URL" --single-transaction -f data.sql
   ```
   (`--data-only` because migrate deploy already built the schema; excluding
   `_prisma_migrations` preserves the freshly written migration history. IDs are
   app-generated cuids — no sequences to resync.)
4. Verify (see checklist). Point a **local** dev environment at Supabase and exercise
   login, student list/search (trigram index path), marksheet save (transaction path),
   analytics (raw-SQL path).
5. Discard the dry-run data before cutover, or plan to re-restore fresh.

### Phase 2 — cutover (short maintenance window)

School systems have natural low-traffic windows (night/weekend); use one.

1. Announce the window; put the app into the window (stop deploys, ideally stop writes —
   simplest: scale the app down / enable a maintenance page).
2. Re-run the data copy (fresh dump → restore, as Phase 1 step 3, into a truncated or
   recreated database).
3. Verification checklist (below) against production data.
4. Flip `DATABASE_URL`/`DIRECT_URL` in the deployment environment; redeploy.
5. Smoke test: login, dashboard, student search, one write + SSE update, one report
   print.
6. Reopen. Keep Neon **read-only and untouched for 14 days**, then decommission.

### Verification checklist

- [ ] Row counts match per table (scripted `SELECT count(*)` comparison across all 75
      tables, Neon vs Supabase).
- [ ] `npx prisma migrate status` reports all 31 migrations applied, none pending.
- [ ] `pg_trgm` installed; trigram indexes present (`node check-indexes.mjs`, and
      `SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%gin_trgm%'`).
- [ ] Constraint spot-checks: per-school email uniqueness, `StudentFile`
      `(studentId, sha256)` unique.
- [ ] App-level: login (session table), permission matrix loads, cursor pagination
      headers on `/api/students`, a `$transaction` flow (e.g. allocation), a raw-SQL
      flow (analytics dashboard).
- [ ] Supabase advisors/logs show no errors after 24 h of traffic.

### Rollback

Any failure before or during the window: flip the env vars back to Neon and redeploy —
Neon was never written to after the freeze, so no data reconciliation is needed. This is
why the write-freeze matters: it makes rollback a pure env-var change for the length of
the retention window.

## Risks

| Risk | Mitigation |
|---|---|
| Prepared-statement errors through the transaction pooler | `pgbouncer=true` in `DATABASE_URL` (verified pattern — same as Neon setup) |
| IPv4-only deploy platform can't reach direct endpoint | Runtime uses pooler; migrations via session-mode pooler or IPv4 add-on |
| Latency shift (different region/provider than Neon) | Measure during dry run before committing to cutover |
| Writes during dump → silent data loss | Hard write-freeze during the window; row-count verification before reopening |
| Cost regression | Pro plan $25/mo baseline vs current Neon plan — accepted as part of platform consolidation |

## After this migration (separate work, not in this window)

1. **File storage** — move `StudentFile.data` bytes into Supabase Storage buckets behind
   a `src/lib/storage.ts` abstraction; API keeps authorizing, downloads via short-lived
   signed URLs. Watch egress quota once mobile ships.
2. **Mobile companion app** — token auth alongside cookies; consumes the existing API.
3. `supabase-js` may be introduced **only** as the SDK for Storage (and later Realtime
   if the SSE bus is ever replaced) — never as a database client.
