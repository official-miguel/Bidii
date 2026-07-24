/**
 * src/lib/assessment/cbeOfflineQueue.ts
 *
 * CBE assessment write helper — API-only (offline queue removed).
 * Writes go directly to the server; no IndexedDB buffering.
 */

import type { PerformanceLevel } from "@/lib/assessment/gradingCbe";

export interface QueueEntry {
  id: string;
  subStrandId: string;
  periodId: string;
  studentId: string;
  level: PerformanceLevel | null;
  comment: string | null;
  timestamp: number;
  retries: number;
  status: "pending" | "stuck";
}

/** Submit one CBE item directly to the server. */
export async function enqueue(
  entry: Omit<QueueEntry, "id" | "timestamp" | "retries" | "status">
): Promise<QueueEntry> {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  // Fire-and-forget to the batch endpoint
  fetch("/api/assessments/cbe/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subStrandId: entry.subStrandId,
      items: [
        {
          periodId: entry.periodId,
          studentId: entry.studentId,
          level: entry.level,
          comment: entry.comment,
        },
      ],
    }),
  }).catch(() => {});

  return {
    id,
    subStrandId: entry.subStrandId,
    periodId: entry.periodId,
    studentId: entry.studentId,
    level: entry.level,
    comment: entry.comment,
    timestamp: Date.now(),
    retries: 0,
    status: "pending",
  };
}

/** Flush — no-op, writes go directly to API. */
export async function flush(): Promise<{ synced: number; stuck: number }> {
  return { synced: 0, stuck: 0 };
}

export async function pendingCount(): Promise<number> { return 0; }
export async function stuckCount(): Promise<number>   { return 0; }
export async function getStuck(): Promise<QueueEntry[]> { return []; }
export async function resetStuck(_id: string): Promise<void> {}
export async function clearSynced(): Promise<void> {}
