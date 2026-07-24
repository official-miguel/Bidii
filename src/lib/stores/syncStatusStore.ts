"use client";

/**
 * src/lib/stores/syncStatusStore.ts
 *
 * Stub — offline sync removed. Kept so imports don't break during transition.
 * All values indicate "online, nothing pending".
 */

import { create } from "zustand";

interface SyncStatusState {
  pending: number;
  stuck: number;
  isOnline: boolean;
  isSyncing: boolean;
  refresh: () => Promise<void>;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  pending: 0,
  stuck: 0,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSyncing: false,
  async refresh() {
    /* no-op — offline sync removed */
  },
  setOnline(online) {
    set({ isOnline: online });
  },
  setSyncing(syncing) {
    set({ isSyncing: syncing });
  },
}));
