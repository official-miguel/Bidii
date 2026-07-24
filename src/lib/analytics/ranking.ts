/**
 * Generic ranking utilities — used by analytics engines that produce
 * ranked or scored lists (e.g. subject rankings, class performance tables).
 * All functions are pure — no DB access.
 */

export interface RankableItem {
  id: string;
  score: number;
}

export interface RankedItem extends RankableItem {
  /** 1-based dense rank (ties share the same rank, no gaps). */
  rank: number;
  /** Change vs. previous rank: positive = improved, negative = dropped. */
  trend?: number;
}

/**
 * Assign dense ranks to items sorted by score descending.
 * Items with equal scores receive the same rank.
 */
export function denseRank(items: RankableItem[]): RankedItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  let currentRank = 1;
  return sorted.map((item, index) => {
    if (index > 0 && item.score < sorted[index - 1].score) {
      currentRank = index + 1;
    }
    return { ...item, rank: currentRank };
  });
}

/**
 * Compute trend direction by comparing current ranks against a previous
 * rank map. Returns positive number if rank improved (lower number = better),
 * negative if dropped, 0 if stable.
 */
export function applyTrends(
  current: RankedItem[],
  previousRanks: Map<string, number>
): RankedItem[] {
  return current.map((item) => {
    const prev = previousRanks.get(item.id);
    const trend = prev !== undefined ? prev - item.rank : 0;
    return { ...item, trend };
  });
}

/**
 * Normalise scores in [0, 1] range. Returns 0 for all-equal arrays.
 */
export function normalise(items: RankableItem[]): RankableItem[] {
  if (items.length === 0) return [];
  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  return items.map((item) => ({
    ...item,
    score: range === 0 ? 0 : (item.score - min) / range,
  }));
}
