/**
 * Core analytics types — shared by all analytics engines.
 * Individual engines (attendance, discipline, etc.) extend these as needed.
 */

export type AnalyticsDomain = "ATTENDANCE" | "DISCIPLINE" | "STAFF" | "ENROLLMENT";

export interface AnalyticsFilters {
  classId?: string;
  streamId?: string;
  subjectId?: string;
  departmentId?: string;
  teacherId?: string;
  period?: {
    termId?: string;
    from?: string;
    to?: string;
  };
}

export interface AnalyticsQuery {
  domain: AnalyticsDomain;
  filters?: AnalyticsFilters;
}

// ---------------------------------------------------------------------------
// Result shape — mirrors what the analytics API routes actually consume.
// ---------------------------------------------------------------------------

export interface AnalyticsMetric {
  label: string;
  value: number | null;
  /** Change vs. previous period as a percentage point, positive = up. */
  delta?: number | null;
}

export interface SeriesPoint {
  label: string;
  value: number | null;
}

export interface AnalyticsSeries {
  key: string;
  label: string;
  points: SeriesPoint[];
}

export interface AnalyticsResult {
  domain: AnalyticsDomain;
  generatedAt: string;
  metrics: AnalyticsMetric[];
  series: AnalyticsSeries[];
}

/** Interface every analytics engine must implement. */
export interface AnalyticsEngine {
  domain: AnalyticsDomain;
  compute(schoolId: string, query: AnalyticsQuery): Promise<AnalyticsResult>;
}
