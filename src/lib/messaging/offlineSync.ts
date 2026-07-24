"use client";

/**
 * src/lib/messaging/offlineSync.ts
 *
 * Messaging recipient search helpers — API-only (offline layer removed).
 */

export type LocalRecipientEntry = {
  id: string;
  schoolId: string;
  name: string;
  displayName: string;
  type: "student" | "teacher";
  classId?: string;
  form?: number;
  staffId?: string;
};

/** Search recipients via the API. */
export async function searchRecipientsLocal(
  query: string,
  _schoolId: string,
  limit = 15
): Promise<LocalRecipientEntry[]> {
  try {
    const res = await fetch(
      `/api/messaging/recipients/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Seed function — no-op without IndexedDB. */
export async function seedRecipientsCache(_schoolId: string): Promise<void> {
  // No-op: recipient search goes directly to the API.
}

/** Outbox count — always 0 without IndexedDB. */
export async function getOutboxCount(): Promise<number> {
  return 0;
}

/** Flush outbox — no-op without IndexedDB. */
export async function flushOutbox(): Promise<void> {
  // No-op.
}

/** Register online flush listener — no-op without outbox. */
export function registerOnlineFlush(): () => void {
  return () => {};
}
