/**
 * Sync Engine
 *
 * Manages bidirectional sync between local WatermelonDB and the remote API.
 * Operations performed offline are queued and automatically pushed when
 * connectivity is restored. Server timestamps are used for fine calculations
 * to prevent incorrect fines from delayed syncs.
 */

import { database, SyncQueue } from '@/database';
import { Q } from '@nozbe/watermelondb';
import { SYNC_RETRY_ATTEMPTS, SYNC_RETRY_DELAY, API_BASE_URL, SCHOOL_ID } from '@/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SyncStatus = 'idle' | 'syncing' | 'error';
type SyncListener = (status: SyncStatus, progress?: number) => void;

const LAST_SYNC_KEY = '@bidii:last_sync_timestamp';

class SyncService {
  private listeners: Set<SyncListener> = new Set();
  private status: SyncStatus = 'idle';
  private isSyncing = false;

  /**
   * Subscribe to sync status changes
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(status: SyncStatus, progress?: number) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status, progress));
  }

  /**
   * Push all queued offline operations to the server
   */
  async pushQueue(): Promise<{ success: number; failed: number }> {
    const queueCollection = database.collections.get<SyncQueue>('sync_queue');
    const pending = await queueCollection
      .query(Q.where('processed_at', null), Q.sortBy('created_at', Q.asc))
      .fetch();

    if (pending.length === 0) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await this.processQueueItem(item);
        
        // Mark as processed
        await database.write(async () => {
          await item.update((record) => {
            record.processedAt = new Date();
          });
        });
        
        success++;
      } catch (error) {
        failed++;
        
        // Increment retry count and record error
        await database.write(async () => {
          await item.update((record) => {
            record.retryCount = record.retryCount + 1;
            record.lastError = error instanceof Error ? error.message : String(error);
          });
        });

        // If max retries exceeded, mark as processed (failed) to prevent infinite loop
        if (item.retryCount >= SYNC_RETRY_ATTEMPTS) {
          console.error(`[Sync] Max retries exceeded for ${item.operationType} ${item.entityType}:`, error);
          await database.write(async () => {
            await item.update((record) => {
              record.processedAt = new Date();
            });
          });
        }
      }
    }

    return { success, failed };
  }

  /**
   * Process a single queue item by calling the appropriate API endpoint
   */
  private async processQueueItem(item: SyncQueue): Promise<void> {
    const payload = item.parsedPayload;
    if (!payload) {
      throw new Error('Invalid payload JSON');
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-School-ID': SCHOOL_ID,
    };

    let url: string;
    let method: string;
    let body: any;

    switch (item.operationType) {
      case 'BORROW':
        url = `${API_BASE_URL}/api/library/circulate/borrow`;
        method = 'POST';
        body = payload;
        break;

      case 'RETURN':
        url = `${API_BASE_URL}/api/library/circulate/return`;
        method = 'POST';
        body = payload;
        break;

      case 'RENEW':
        url = `${API_BASE_URL}/api/library/circulate/renew`;
        method = 'POST';
        body = payload;
        break;

      case 'CREATE':
        url = `${API_BASE_URL}/api/library/${item.entityType}`;
        method = 'POST';
        body = payload;
        break;

      case 'UPDATE':
        url = `${API_BASE_URL}/api/library/${item.entityType}/${item.entityId}`;
        method = 'PATCH';
        body = payload;
        break;

      case 'DELETE':
        url = `${API_BASE_URL}/api/library/${item.entityType}/${item.entityId}`;
        method = 'DELETE';
        body = undefined;
        break;

      default:
        throw new Error(`Unknown operation type: ${item.operationType}`);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    // Update local record with server response if needed
    const serverData = await response.json();
    if (serverData.id || serverData.remoteId) {
      await this.updateLocalRecordWithServerData(item.entityType, item.entityId, serverData);
    }
  }

  /**
   * Update local record with server-returned data (e.g., remote ID, timestamps)
   */
  private async updateLocalRecordWithServerData(
    entityType: string,
    localId: string,
    serverData: any
  ): Promise<void> {
    try {
      const collection = database.collections.get(this.getTableName(entityType));
      const record = await collection.find(localId);

      await database.write(async () => {
        await record.update((r: any) => {
          if (serverData.id) r.remoteId = serverData.id;
          if (serverData.updatedAt) r.updatedAt = new Date(serverData.updatedAt);
          r.syncedAt = new Date();
        });
      });
    } catch (error) {
      console.warn(`[Sync] Could not update local record ${entityType}:${localId}:`, error);
    }
  }

  /**
   * Pull latest data from server (full sync)
   */
  async pullFromServer(lastSyncTimestamp?: number): Promise<void> {
    const timestamp = lastSyncTimestamp ?? (await this.getLastSyncTimestamp());
    
    const headers = {
      'Content-Type': 'application/json',
      'X-School-ID': SCHOOL_ID,
    };

    // Fetch delta changes since last sync
    const url = `${API_BASE_URL}/api/library/sync/pull?since=${timestamp}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Pull failed: HTTP ${response.status}`);
    }

    const data = await response.json();

    // Batch write all updates to WatermelonDB
    await database.write(async () => {
      // Update catalogues
      if (data.catalogues) {
        await this.upsertRecords('library_catalogues', data.catalogues);
      }

      // Update copies
      if (data.copies) {
        await this.upsertRecords('library_copies', data.copies);
      }

      // Update students
      if (data.students) {
        await this.upsertRecords('students', data.students);
      }

      // Update cards
      if (data.cards) {
        await this.upsertRecords('library_cards', data.cards);
      }

      // Update borrows
      if (data.borrows) {
        await this.upsertRecords('library_borrows', data.borrows);
      }

      // Update reservations
      if (data.reservations) {
        await this.upsertRecords('library_reservations', data.reservations);
      }
    });

    // Update last sync timestamp
    await this.setLastSyncTimestamp(Date.now());
  }

  /**
   * Upsert (insert or update) records in a collection
   */
  private async upsertRecords(tableName: string, records: any[]): Promise<void> {
    const collection = database.collections.get(tableName);

    for (const serverRecord of records) {
      try {
        // Try to find existing record by remote_id
        const existing = await collection
          .query(Q.where('remote_id', serverRecord.id))
          .fetch();

        if (existing.length > 0) {
          // Update existing
          await existing[0].update((r: any) => {
            this.mapServerDataToModel(r, serverRecord);
          });
        } else {
          // Create new
          await collection.create((r: any) => {
            r.remoteId = serverRecord.id;
            this.mapServerDataToModel(r, serverRecord);
          });
        }
      } catch (error) {
        console.warn(`[Sync] Error upserting ${tableName}:`, error);
      }
    }
  }

  /**
   * Map server data fields to WatermelonDB model fields
   */
  private mapServerDataToModel(model: any, serverData: any): void {
    // Generic field mapping (snake_case server → camelCase model)
    Object.keys(serverData).forEach((key) => {
      if (key === 'id') return; // Skip id, use remoteId
      
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = serverData[key];

      // Convert ISO strings to Date objects
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        model[camelKey] = new Date(value);
      } else {
        model[camelKey] = value;
      }
    });

    model.syncedAt = new Date();
  }

  /**
   * Get table name from entity type
   */
  private getTableName(entityType: string): string {
    const map: Record<string, string> = {
      catalogue:    'library_catalogues',
      copy:         'library_copies',
      student:      'students',
      card:         'library_cards',
      borrow:       'library_borrows',
      reservation:  'library_reservations',
    };
    return map[entityType] || entityType;
  }

  /**
   * Full bidirectional sync: push queue, then pull server changes
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping');
      return;
    }

    this.isSyncing = true;
    this.notifyListeners('syncing', 0);

    try {
      // Step 1: Push offline queue
      this.notifyListeners('syncing', 33);
      const pushResult = await this.pushQueue();
      console.log('[Sync] Push complete:', pushResult);

      // Step 2: Pull server changes
      this.notifyListeners('syncing', 66);
      await this.pullFromServer();
      console.log('[Sync] Pull complete');

      this.notifyListeners('idle', 100);
    } catch (error) {
      console.error('[Sync] Error:', error);
      this.notifyListeners('error');
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get last sync timestamp from storage
   */
  private async getLastSyncTimestamp(): Promise<number> {
    try {
      const value = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return value ? parseInt(value, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Save last sync timestamp to storage
   */
  private async setLastSyncTimestamp(timestamp: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp.toString());
    } catch (error) {
      console.warn('[Sync] Could not save last sync timestamp:', error);
    }
  }

  /**
   * Queue an offline operation
   */
  async queueOperation(
    operationType: 'BORROW' | 'RETURN' | 'RENEW' | 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: string,
    entityId: string,
    payload: any
  ): Promise<void> {
    await database.write(async () => {
      const queueCollection = database.collections.get<SyncQueue>('sync_queue');
      await queueCollection.create((record) => {
        record.operationType = operationType;
        record.entityType = entityType;
        record.entityId = entityId;
        record.payload = JSON.stringify(payload);
        record.retryCount = 0;
        record.lastError = null;
        record.processedAt = null;
      });
    });
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Get pending queue count
   */
  async getPendingCount(): Promise<number> {
    const queueCollection = database.collections.get<SyncQueue>('sync_queue');
    return await queueCollection.query(Q.where('processed_at', null)).fetchCount();
  }
}

export const syncService = new SyncService();
