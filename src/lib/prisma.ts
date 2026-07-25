import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Connection pool configuration — Neon serverless (PgBouncer pooler)
//
// Neon uses a PgBouncer pooler endpoint (the URL contains "-pooler.").
// PgBouncer requires:
//   1. connection_limit  — Prisma's per-process pool size. With PgBouncer the
//      pooler fans out to real Postgres connections, so Prisma can safely hold
//      several connections. Defaults to 10; override with DATABASE_POOL_SIZE.
//   2. pool_timeout=30   — seconds Prisma waits for a free slot before throwing
//      "Timed out fetching a new connection". Default is 10, which is too short
//      when multiple server components render concurrently.
//   3. statement_cache_size=0  — PgBouncer in transaction mode does not
//      support prepared statements. Disabling them prevents "prepared
//      statement does not exist" errors.
//   4. pgbouncer=true  — tells Prisma to skip its own connection pooling
//      logic when a PgBouncer sits in front.
//
// channel_binding=require is intentionally removed — PgBouncer does not
// support SCRAM channel binding and will drop the connection silently.
//
// connect_timeout=15 — gives Neon up to 15 s to wake a cold compute
// endpoint before Prisma gives up (default is 5 s, too short for cold starts).
//
// DATABASE_POOL_SIZE: override the per-process pool size. Defaults to 10.
// ---------------------------------------------------------------------------

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Default pool size of 10. The Neon PgBouncer pooler handles the actual
// backend connections, so Prisma can safely keep multiple slots open.
const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "10", 10);

// Build the datasource URL, enforcing the params required for PgBouncer.
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  try {
    const url = new URL(base);

    // Remove channel_binding — not supported by PgBouncer.
    url.searchParams.delete("channel_binding");

    // PgBouncer compatibility flags.
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    // One connection per process — the pooler handles fan-out.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(poolSize));
    }

    // Disable prepared statement cache — incompatible with PgBouncer
    // transaction mode.
    if (!url.searchParams.has("statement_cache_size")) {
      url.searchParams.set("statement_cache_size", "0");
    }

    // Give Neon time to wake a cold compute endpoint.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "20");
    }

    // How long (seconds) Prisma waits for a free connection slot before
    // throwing "Timed out fetching a new connection". Raise above the default
    // of 10 to handle bursts of concurrent server-component renders.
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }

    // TCP keepalives — tells Neon the connection is still alive so it
    // doesn't close it mid-request during slow queries.
    if (!url.searchParams.has("keepalives")) {
      url.searchParams.set("keepalives", "1");
    }
    if (!url.searchParams.has("keepalives_idle")) {
      url.searchParams.set("keepalives_idle", "10");
    }

    return url.toString();
  } catch {
    return base; // malformed URL — leave untouched, Prisma will surface the error
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // In development: only show errors, not the harmless "connection closed"
    // warnings that Neon emits when it recycles idle serverless connections.
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
  });

// Prevents exhausting Postgres connections from Next.js dev-mode hot reload,
// which re-evaluates modules on every file save.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
