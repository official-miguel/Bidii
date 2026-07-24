import type { AnalyticsDomain, AnalyticsEngine } from "./types";

export * from "./types";
export * as statistics from "./statistics";
export * as ranking from "./ranking";

/// Registry of analytics engines. Each future engine (attendance, discipline,
/// staff, enrollment) lives in src/lib/analytics/engines/ and registers
/// itself here.
const ENGINES: Partial<Record<AnalyticsDomain, AnalyticsEngine>> = {};

export function getAnalyticsEngine(domain: AnalyticsDomain): AnalyticsEngine | null {
  return ENGINES[domain] ?? null;
}

export function listAvailableDomains(): AnalyticsDomain[] {
  return Object.keys(ENGINES) as AnalyticsDomain[];
}
