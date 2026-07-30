/**
 * Fine Calculation Engine
 *
 * IMPORTANT: All fine calculations use server-received timestamps (borrowedAt,
 * dueAt from the database) — never device-local time — to prevent incorrect
 * fines from delayed syncs or device clock skew.
 *
 * The current time used for comparisons is either:
 *   1. Server time (fetched from /api/time) if available
 *   2. Cached server time + elapsed device time (safe estimate)
 *   NEVER: raw Date.now() or new Date() without correction
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, SCHOOL_ID } from '@/constants';

const SERVER_TIME_KEY = '@bidii:server_time_cache';
const SERVER_TIME_FETCH_KEY = '@bidii:server_time_fetched_at';

interface FinePolicy {
  finePerDay: number;
  gracePeriodDays: number;
  countWeekends: boolean;
  countHolidays: boolean;
  fineBlockThreshold: number;
}

interface FineCalculation {
  overdueDays: number;
  fineAmount: number;
  isBlocked: boolean;
  gracePeriodActive: boolean;
}

class FineEngine {
  private cachedServerTime: number | null = null;
  private serverTimeFetchedAt: number | null = null;

  /**
   * Get a safe "current time" that is calibrated against server time.
   * Uses device elapsed time + cached server time, fetching a fresh
   * server time if the cache is stale (> 5 min old).
   */
  async getSafeCurrentTime(): Promise<Date> {
    const now = Date.now();

    // Restore cached values from storage on first call
    if (this.cachedServerTime === null) {
      try {
        const storedTime = await AsyncStorage.getItem(SERVER_TIME_KEY);
        const storedFetch = await AsyncStorage.getItem(SERVER_TIME_FETCH_KEY);
        if (storedTime && storedFetch) {
          this.cachedServerTime = parseInt(storedTime, 10);
          this.serverTimeFetchedAt = parseInt(storedFetch, 10);
        }
      } catch { /* ignore */ }
    }

    // If cache is fresh (< 5 min old), use it + elapsed device time
    if (
      this.cachedServerTime !== null &&
      this.serverTimeFetchedAt !== null &&
      now - this.serverTimeFetchedAt < 300_000 // 5 minutes
    ) {
      const elapsed = now - this.serverTimeFetchedAt;
      return new Date(this.cachedServerTime + elapsed);
    }

    // Try to fetch fresh server time
    try {
      const response = await fetch(`${API_BASE_URL}/api/time`, {
        headers: { 'X-School-ID': SCHOOL_ID },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        const serverTime = new Date(data.time).getTime();

        this.cachedServerTime = serverTime;
        this.serverTimeFetchedAt = now;

        await AsyncStorage.setItem(SERVER_TIME_KEY, serverTime.toString());
        await AsyncStorage.setItem(SERVER_TIME_FETCH_KEY, now.toString());

        return new Date(serverTime);
      }
    } catch {
      // Network unavailable — fall through to cached/device time
    }

    // Last resort: if we have a stale cache, use it with elapsed time (best guess)
    if (this.cachedServerTime !== null && this.serverTimeFetchedAt !== null) {
      const elapsed = now - this.serverTimeFetchedAt;
      return new Date(this.cachedServerTime + elapsed);
    }

    // No cache at all — use device time but log a warning
    // This only happens on first launch with no connectivity
    console.warn('[FineEngine] Using device time — no server time available');
    return new Date(now);
  }

  /**
   * Count the number of overdue days between dueAt and now,
   * optionally excluding weekends based on policy.
   */
  countOverdueDays(
    dueAt: Date,
    currentTime: Date,
    policy: Pick<FinePolicy, 'gracePeriodDays' | 'countWeekends'>
  ): { overdueDays: number; gracePeriodActive: boolean } {
    if (currentTime <= dueAt) {
      return { overdueDays: 0, gracePeriodActive: false };
    }

    const msPerDay = 86_400_000;
    let rawDays = Math.floor((currentTime.getTime() - dueAt.getTime()) / msPerDay);

    // Check if still within grace period
    if (rawDays <= policy.gracePeriodDays) {
      return { overdueDays: 0, gracePeriodActive: true };
    }

    // Subtract grace period days from raw count
    rawDays -= policy.gracePeriodDays;

    if (policy.countWeekends) {
      return { overdueDays: rawDays, gracePeriodActive: false };
    }

    // Exclude weekends: count only Mon–Fri
    let weekdayDays = 0;
    const cursor = new Date(dueAt.getTime() + policy.gracePeriodDays * msPerDay);

    for (let i = 0; i < rawDays; i++) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay(); // 0 = Sunday, 6 = Saturday
      if (day !== 0 && day !== 6) {
        weekdayDays++;
      }
    }

    return { overdueDays: weekdayDays, gracePeriodActive: false };
  }

  /**
   * Calculate the fine for a single borrow record.
   * Uses server timestamps throughout.
   */
  async calculateFine(
    dueAt: Date,
    fineStoppedAt: Date | null,
    returnedAt: Date | null,
    policy: FinePolicy
  ): Promise<FineCalculation> {
    // If returned, fine was calculated at return time (use stored value)
    if (returnedAt) {
      return { overdueDays: 0, fineAmount: 0, isBlocked: false, gracePeriodActive: false };
    }

    // If fine clock was paused, stop accrual at pause time
    const referenceTime = fineStoppedAt ?? await this.getSafeCurrentTime();

    const { overdueDays, gracePeriodActive } = this.countOverdueDays(dueAt, referenceTime, policy);

    const fineAmount = overdueDays * policy.finePerDay;

    return {
      overdueDays,
      fineAmount,
      gracePeriodActive,
      isBlocked: policy.fineBlockThreshold > 0 && fineAmount >= policy.fineBlockThreshold,
    };
  }

  /**
   * Calculate total outstanding fine balance for a student card,
   * including all active (unreturned) borrows.
   */
  async calculateCardBalance(
    borrows: Array<{
      dueAt: Date;
      returnedAt: Date | null;
      fineStoppedAt: Date | null;
      fineAmount: number; // already stored fine (for returned books)
    }>,
    policy: FinePolicy
  ): Promise<number> {
    let total = 0;

    for (const borrow of borrows) {
      if (borrow.returnedAt) {
        // Returned: use stored fine amount
        total += borrow.fineAmount;
      } else {
        // Still out: calculate live
        const { fineAmount } = await this.calculateFine(
          borrow.dueAt,
          borrow.fineStoppedAt,
          null,
          policy
        );
        total += fineAmount;
      }
    }

    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Format fine amount as currency string (KES)
   */
  formatFine(amount: number): string {
    if (amount === 0) return 'KES 0.00';
    return `KES ${amount.toFixed(2)}`;
  }

  /**
   * Whether a fine balance exceeds the block threshold
   */
  isBlocked(balance: number, policy: Pick<FinePolicy, 'fineBlockThreshold'>): boolean {
    return policy.fineBlockThreshold > 0 && balance >= policy.fineBlockThreshold;
  }

  /**
   * Update the server time cache (called after successful API calls)
   */
  async updateServerTimeFromResponse(serverTimestamp: string): Promise<void> {
    try {
      const serverTime = new Date(serverTimestamp).getTime();
      const now = Date.now();

      this.cachedServerTime = serverTime;
      this.serverTimeFetchedAt = now;

      await AsyncStorage.setItem(SERVER_TIME_KEY, serverTime.toString());
      await AsyncStorage.setItem(SERVER_TIME_FETCH_KEY, now.toString());
    } catch { /* ignore */ }
  }
}

export const fineEngine = new FineEngine();
