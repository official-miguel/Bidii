"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DeptAnalyticsPayload } from "@/app/api/assessments/department/analytics/route";

// Recharts-based chart components — loaded only when the analytics panel mounts.
// Each gets its own chunk so the main assessment shell stays lean.
const DeptMeanTrend  = dynamic(() => import("./DeptMeanTrend"),  { ssr: false });
const DeptSubjectBar = dynamic(() => import("./DeptSubjectBar"),  { ssr: false });
const DeptVsSchoolLine = dynamic(() => import("./DeptVsSchoolLine"), { ssr: false });
// DeptHeatmap is pure CSS — still lazy-load to keep the initial chunk tight.
const DeptHeatmap    = dynamic(() => import("./DeptHeatmap"),    { ssr: false });

interface Department {
  id: string;
  name: string;
}

interface DeptAnalyticsPageProps {
  departments: Department[];
  defaultDepartmentId?: string;
  currentPeriodId?: string;
  periods: Array<{ id: string; name: string; academicYear: string; term: number | null }>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-ink mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function DeptAnalyticsPage({
  departments,
  defaultDepartmentId,
  currentPeriodId,
  periods,
}: DeptAnalyticsPageProps) {
  const [deptId, setDeptId] = useState(defaultDepartmentId ?? departments[0]?.id ?? "");
  const [periodId, setPeriodId] = useState(currentPeriodId ?? periods[0]?.id ?? "");
  const [data, setData] = useState<DeptAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!deptId || !periodId) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/assessments/department/analytics?periodId=${periodId}&departmentId=${deptId}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [deptId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  const isPartial =
    data &&
    data.subjectBreakdown.some((s) => s.meanPoints === null) &&
    data.subjectBreakdown.some((s) => s.meanPoints !== null);

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Department</label>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-royal"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Period</label>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-royal"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.term ? `Term ${p.term} — ${p.academicYear}` : `${p.name} ${p.academicYear}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      )}

      {/* Partial data notice */}
      {isPartial && !loading && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
          Some subjects have incomplete mark entry. Charts show partial data.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-line/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Charts */}
      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Subject Breakdown">
            <DeptSubjectBar
              data={data.subjectBreakdown}
              drillDownBase="/principal/assessments/dashboard"
            />
          </ChartCard>

          <ChartCard title="Department Mean Trend">
            <DeptMeanTrend data={data.trendData} deptName={data.departmentName} />
          </ChartCard>

          <ChartCard title="Department vs. School Average">
            <DeptVsSchoolLine data={data.trendData} deptName={data.departmentName} />
          </ChartCard>

          <ChartCard title="Class × Subject Heatmap">
            <DeptHeatmap cells={data.heatmap} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}
