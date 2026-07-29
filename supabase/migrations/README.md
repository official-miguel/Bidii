# Supabase migrations — GENERATED, do not hand-edit

Prisma is the **single migration authority** for this project (see [MIGRATION.md](../../MIGRATION.md)).
The files here are *derived* artifacts so the Supabase CLI (`supabase db reset`, local
stack, hosted `db push`) can build the exact production schema. Never write a new
migration here by hand — change `prisma/schema.prisma` (or add a Prisma migration for
raw SQL) and regenerate.

## Files

| File | Source | Contents |
|---|---|---|
| `20260729000000_baseline_schema.sql` | `prisma/schema.prisma` via `prisma migrate diff --from-empty --to-schema ... --script` | All 75 modeled tables, enums, FKs, and datamodel-declared indexes |
| `20260729000001_raw_sql_supplement.sql` | Hand-picked from `prisma/migrations/` | Everything the datamodel cannot express: `pg_trgm` extension; the 7 raw-SQL-only timetable-v2 tables (`TimetableVersion`, `TimetableVersionSlot`, `TimetableChangeLog`, `TimetableTemplate`, `OperatingDay`, `SpecialPeriod`, `SubjectWorkloadRule`) + the unmodeled `TimetableConfig` columns; 24 custom indexes (trigram GIN, partial, composite) from perf/scale/library migrations |

## Why not just concatenate `prisma/migrations/`?

The migrations folder does **not** contain the base schema — the original tables
(`School`, `User`, `Student`, ...) were created before migration history began
(concatenating all 31 migrations yields only 42 of 82 tables). The authoritative
sources are therefore:

1. `prisma/schema.prisma` — the 75 modeled tables
2. The raw-SQL-only artifacts inside specific migrations — the supplement file

**This also means a bare `prisma migrate deploy` against an empty database will NOT
produce a working schema.** For a fresh database, apply these two files (or restore a
dump), then run `prisma migrate resolve --applied <migration>` for each historical
migration to baseline Prisma's history table.

## Regenerating

```bash
# 1. Baseline (strip the datasource url line first if on Prisma 7 CLI):
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script

# 2. Supplement: re-extract if raw-SQL migrations changed —
#    pg_trgm + enterprise_timetable_engine + timetable_overrides migrations +
#    any CREATE INDEX in prisma/migrations/ absent from the baseline.
```

Keep the generated file names' timestamps stable unless the schema actually changed.
