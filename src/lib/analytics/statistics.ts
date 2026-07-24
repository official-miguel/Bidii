/**
 * Statistical utility functions for analytics engines.
 * All functions are pure — no DB access, no side effects.
 */

/** Arithmetic mean. Returns null for empty arrays. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation. Returns null for fewer than 2 values. */
export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values)!;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/** Median value. Returns null for empty arrays. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Percentile (0–100). Returns null for empty arrays. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Count occurrences of each unique value. */
export function frequency<T extends string | number>(
  values: T[]
): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => {
    const key = String(v);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
