/**
 * src/lib/messaging/batchProgress.ts
 *
 * In-process progress tracking for exam-results bulk sends.
 * Uses a simple Map so the POST and GET progress routes on the same server
 * instance can share state. For multi-instance deployments this would need
 * a Redis store, but for the current single-server setup this is sufficient.
 */

export type BatchProgress = {
  total:   number;
  sent:    number;
  failed:  number;
  done:    boolean;
  skipped: { name: string; reason: string }[];
};

const _store = new Map<string, BatchProgress>();

export function initBatch(batchId: string, total: number): void {
  _store.set(batchId, { total, sent: 0, failed: 0, done: false, skipped: [] });
}

export function incrementSent(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.sent++;
}

export function incrementFailed(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.failed++;
}

export function addSkipped(batchId: string, name: string, reason: string): void {
  const b = _store.get(batchId);
  if (b) b.skipped.push({ name, reason });
}

export function markDone(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.done = true;
}

export function getProgress(batchId: string): BatchProgress | null {
  return _store.get(batchId) ?? null;
}
