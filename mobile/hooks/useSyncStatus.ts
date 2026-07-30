/**
 * useSyncStatus — subscribes to sync engine status
 */

import { useState, useEffect } from 'react';
import { syncService } from '@/services/sync';

type SyncStatus = 'idle' | 'syncing' | 'error';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus());
  const [progress, setProgress] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((newStatus, newProgress) => {
      setStatus(newStatus);
      if (newProgress !== undefined) setProgress(newProgress);
    });

    // Poll pending count
    const interval = setInterval(async () => {
      const count = await syncService.getPendingCount();
      setPendingCount(count);
    }, 5000);

    // Get initial pending count
    syncService.getPendingCount().then(setPendingCount);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const triggerSync = () => syncService.sync().catch(console.error);

  return { status, progress, pendingCount, triggerSync };
}
