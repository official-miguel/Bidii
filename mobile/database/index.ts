/**
 * WatermelonDB Database Setup
 *
 * Initializes the local offline-first database using expo-sqlite as the adapter.
 * All library operations are saved here first, then synced to the server.
 */

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import * as models from './models';

const adapter = new SQLiteAdapter({
  schema,
  // Required for JSC on iOS < 14
  jsi: false,
  // Optional performance optimizations
  onSetUpError: (error) => {
    console.error('[WatermelonDB] Setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    models.LibraryCatalogue,
    models.LibraryCopy,
    models.Student,
    models.LibraryCard,
    models.LibraryBorrow,
    models.LibraryReservation,
    models.SyncQueue,
  ],
});

export * from './models';
export { schema };
