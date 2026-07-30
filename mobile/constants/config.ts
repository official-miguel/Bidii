/**
 * App-wide configuration constants
 */

// API configuration
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
export const SCHOOL_ID = process.env.SCHOOL_ID || '';
export const DEBUG = process.env.DEBUG === 'true';

// Sync configuration
export const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '300000', 10); // 5 minutes
export const SYNC_RETRY_ATTEMPTS = 3;
export const SYNC_RETRY_DELAY = 5000; // 5 seconds

// Search & UI configuration
export const SEARCH_DEBOUNCE_MS = 250;
export const PAGINATION_SIZE = 50;
export const MAX_BOOKS_PER_STUDENT_DEFAULT = 3;
export const MAX_BORROW_DAYS_DEFAULT = 14;
export const FINE_PER_DAY_DEFAULT = 5.0;
export const MAX_RENEWALS_DEFAULT = 1;

// QR scanning
export const QR_CODE_PREFIX = 'BIDII:';
export const SCAN_COOLDOWN_MS = 1000; // Prevent duplicate scans

// Cache & storage
export const CACHE_DURATION_MS = 300000; // 5 minutes
export const MAX_OFFLINE_QUEUE_SIZE = 1000;

// Validation
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

// Display formats
export const DATE_FORMAT = 'dd MMM yyyy';
export const DATETIME_FORMAT = 'dd MMM yyyy HH:mm';
export const CURRENCY_SYMBOL = 'KES';
export const CURRENCY_DECIMALS = 2;
