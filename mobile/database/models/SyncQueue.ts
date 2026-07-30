import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * Queue for offline operations waiting to sync to server.
 * Each row represents a single operation (borrow, return, create, etc.)
 * that was performed offline and needs to be sent to the backend.
 */
export default class SyncQueueModel extends Model {
  static table = 'sync_queue';

  @field('operation_type')  operationType!: string;   // BORROW | RETURN | RENEW | CREATE | UPDATE | DELETE
  @field('entity_type')     entityType!: string;      // catalogue | copy | borrow | reservation | card | settings
  @field('entity_id')       entityId!: string;        // local ID or remote ID
  @field('payload')         payload!: string;         // JSON stringified data
  @field('retry_count')     retryCount!: number;
  @field('last_error')      lastError!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('processed_at')     processedAt!: Date | null;

  get parsedPayload(): any {
    try {
      return JSON.parse(this.payload);
    } catch {
      return null;
    }
  }
}
