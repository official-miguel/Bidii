"use client";

import { useEffect, useState, useCallback } from "react";
import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";
import Top3Leaderboard from "./Top3Leaderboard";
import DeptTop3Leaderboard from "./DeptTop3Leaderboard";
import StaffRankTable from "./StaffRankTable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeptStub {
  id: string;
  name: string;
}

interface RankingResponse {
  scope: "school" | "department";
  top3: TeacherRankResult[];
  schoolTop3?: TeacherRankResult[];
  fullList: TeacherRankResult[];
  ownRow: TeacherRankResult | null;
  ownDepartmentId: string | null;
  departments: DeptStub[];
}

interface StaffPerformancePageProps {
  /**
   * "teacher"  — sees own rank card + school top3 + dept leaderboard for own dept
   * "hod"      — sees dept leaderboard (own dept only) + full dept table
   * "director" — sees all-school view with dept tabs + full table per tab
   */
  viewMode: "teacher" | "hod" | "director";
  periodId: string;
  /** Pre-resolved dept id (HOD's own dept, or teacher's dept). */
  departmentId?: string;
  /** For row highlight in the table. */
  currentTeacherId?: string;
  periods: Array<{ id: string; name: string; academicYear: string; term: number | null }>;
  /** Pre-loaded department list (director/principal only — fetched server-side). */
  initialDepartments?: DeptStub[];
}

// ---------------------------------------------------------------------------
// OwnRankCard
// ---------------------------------------------------------------------------

function OwnRankCard({ row }: { row: TeacherRankResult }) {
  const trendLabel =
    row.trendDirection === 1  ? "↑ Improved from last period" :
    row.trendDirection === -1 ? "↓ Declined from last period" :
                                "— Stable";
  const trendColor =
    row.trendDirection === 1  ? "text-green-600" :
    row.trendDirection === -1 ? "text-red-500"   : "text-slate";

  return (
    <div className="bg-white border border-royal/30 rounded-xl p-5 shadow-sm flex flex-col gap-2 max-w-sm">
      <p className="text-xs text-slate font-medium uppercase tracking-wide">Your Ranking</p>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-royal">#{row.rank}</span>
        <span className="text-sm text-slate">
          composite score {(row.compositeScore * 100).toFixed(1)}
        </span>
      </div>
      <p className={`text-sm font-medium ${trendColor}`}>{trendLabel}</p>
      <div className="grid grid-cols-3 gap-2 mt-1 text-xs text-slate">
        <div>
          <p className="font-medium text-ink">Entry</p>
          <p>{Math.round(row.completionScore * 100)}%</p>
        </div>
        <div>
          <p className="font-medium text-ink">Mean pts</p>
          <p>{row.absoluteMean?.toFixed(1) ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium text-ink">Prev pts</p>
          <p>{row.prevMean?.toFixed(1) ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar (used by director for dept switching)
// ---------------------------------------------------------------------------

interface TabBarProps {
  tabs: Array<{ id: string | null; label: string }>;
  active: string | null;
  onChange: (id: string | null) => void;
}

function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id ?? "__school__"}
          onClick={() => onChange(t.id)}
          className={`shrink-0 px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
            active === t.id
              ? "bg-royal text-white"
              : "text-slate hover:text-ink hover:bg-paper"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StaffPerformancePage({
  viewMode,
  periodId: defaultPeriodId,
  departmentId: propDeptId,
  currentTeacherId,
  periods,
  initialDepartments = [],
}: StaffPerformancePageProps) {
  const [periodId,     setPeriodId]     = useState(defaultPeriodId);
  const [activeDeptId, setActiveDeptId] = useState<string | null>(propDeptId ?? null);
  const [data,         setData]         = useState<RankingResponse | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // departments available for tabs — initially from server, merged with API response
  const [departments, setDepartments] = useState<DeptStub[]>(initialDepartments);

  const fetchRanking = useCallback(async (pid: string, deptId: string | null) => {
    if (!pid) return;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ periodId: pid });
    if (deptId) {
      qs.set("scope", "department");
      qs.set("departmentId", deptId);
    } else {
      qs.set("scope", "school");
    }

    try {
      const res = await fetch(`/api/assessments/staff/ranking?${qs}`);
      const d: RankingResponse = await res.json();
      if ("error" in d) {
        setError((d as { error: string }).error);
      } else {
        setData(d);
        // Merge department list if the API returned one (director/principal view)
        if (d.departments.length > 0) setDepartments(d.departments);
        // Auto-select own dept on first load for teacher/hod
        if (!activeDeptId && d.ownDepartmentId) {
          setActiveDeptId(d.ownDepartmentId);
        }
      }
    } catch {
      setError("Failed to load ranking data.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRanking(periodId, activeDeptId);
  }, [periodId, activeDeptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build tab list for director/principal
  const isDirector = viewMode === "director";
  const tabs = isDirector
    ? [
        { id: null,  label: "All School" },
        ...departments.map((d) => ({ id: d.id, label: d.name })),
      ]
    : [];

  // For teacher/hod: are we currently viewing a dept scope?
  const isViewingDept = activeDeptId !== null;
  const activeDeptName =
    departments.find((d) => d.id === activeDeptId)?.name ??
    data?.top3[0]?.departmentName ??
    "Department";

  return (
    <div className="space-y-6">
      {/* ---- Controls row -------------------------------------------------- */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Period picker */}
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Period</label>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-royal"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.term ? `Term ${p.term} — ${p.academicYear}` : `${p.name} — ${p.academicYear}`}
              </option>
            ))}
          </select>
        </div>

        {/* Teacher / HOD: toggle between school view and dept view */}
        {(viewMode === "teacher" || viewMode === "hod") && propDeptId && (
          <div className="flex rounded-md border border-line overflow-hidden text-sm">
            <button
              onClick={() => setActiveDeptId(null)}
              className={`px-3 py-2 transition-colors ${
                !isViewingDept
                  ? "bg-royal text-white font-medium"
                  : "text-slate hover:bg-paper"
              }`}
            >
              School Top 3
            </button>
            <button
              onClick={() => setActiveDeptId(propDeptId)}
              className={`px-3 py-2 transition-colors ${
                isViewingDept
                  ? "bg-royal text-white font-medium"
                  : "text-slate hover:bg-paper"
              }`}
            >
              My Department
            </button>
          </div>
        )}
      </div>

      {/* ---- Director dept tab bar ----------------------------------------- */}
      {isDirector && tabs.length > 1 && (
        <TabBar tabs={tabs} active={activeDeptId} onChange={setActiveDeptId} />
      )}

      {/* ---- Error --------------------------------------------------------- */}
      {error && (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      )}

      {/* ---- Skeleton ------------------------------------------------------ */}
      {loading && (
        <div className="space-y-4">
          <div className="h-28 rounded-xl bg-line/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-line/40 animate-pulse" />
        </div>
      )}

      {/* ---- Content ------------------------------------------------------- */}
      {!loading && data && (
        <div className="space-y-8">
          {/* Recognition copy */}
          <p className="text-sm text-slate">
            Rankings recognise consistent mark entry, student improvement, and overall
            performance. Use this as a coaching guide, not a judgment.
          </p>

          {/* ================================================================
              TEACHER VIEW
              — School scope: own rank card + school top 3
              — Dept scope:   own rank card + dept top 3 podium + full dept table
          ================================================================ */}
          {viewMode === "teacher" && (
            <div className="space-y-6">
              {/* Own rank card always visible */}
              {data.ownRow ? (
                <OwnRankCard row={data.ownRow} />
              ) : (
                <p className="text-sm text-slate italic">
                  No ranking data for you this period.
                </p>
              )}

              {!isViewingDept && (
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3">
                    School Top Performers
                  </h3>
                  <Top3Leaderboard top3={data.top3} />
                </div>
              )}

              {isViewingDept && (
                <>
                  <DeptTop3Leaderboard
                    top3={data.top3}
                    departmentName={activeDeptName}
                    highlightTeacherId={currentTeacherId}
                  />
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink mb-3">
                        Full {activeDeptName} Rankings
                      </h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={false}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ================================================================
              HOD VIEW
              — Always dept-scoped
              — Dept top 3 podium + full dept table
          ================================================================ */}
          {viewMode === "hod" && (
            <div className="space-y-6">
              {!isViewingDept ? (
                // School scope: show school top3 only (HOD requested school view)
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3">School Top Performers</h3>
                  <Top3Leaderboard top3={data.top3} />
                </div>
              ) : (
                <>
                  <DeptTop3Leaderboard
                    top3={data.top3}
                    departmentName={activeDeptName}
                    highlightTeacherId={currentTeacherId}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-3">
                      {activeDeptName} Department Rankings
                    </h3>
                    <StaffRankTable
                      rows={data.fullList}
                      highlightTeacherId={currentTeacherId}
                      showDepartmentColumn={false}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================================================================
              DIRECTOR / PRINCIPAL VIEW
              — "All School" tab: school top3 + full school table
              — Dept tab:        dept top3 podium + full dept table
                                 + school top3 in a collapsible aside
          ================================================================ */}
          {viewMode === "director" && (
            <div className="space-y-6">
              {!activeDeptId ? (
                /* All-school tab */
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-3">
                      School Top Performers
                    </h3>
                    <Top3Leaderboard top3={data.top3} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-3">All Staff Rankings</h3>
                    <StaffRankTable
                      rows={data.fullList}
                      highlightTeacherId={currentTeacherId}
                      showDepartmentColumn={true}
                    />
                  </div>
                </>
              ) : (
                /* Dept tab */
                <>
                  <DeptTop3Leaderboard
                    top3={data.top3}
                    departmentName={activeDeptName}
                    highlightTeacherId={currentTeacherId}
                  />

                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-3">
                      {activeDeptName} Department Rankings
                    </h3>
                    <StaffRankTable
                      rows={data.fullList}
                      highlightTeacherId={currentTeacherId}
                      showDepartmentColumn={false}
                    />
                  </div>

                  {/* School-wide top 3 as a reference sidebar */}
                  {data.schoolTop3 && data.schoolTop3.length > 0 && (
                    <details className="rounded-xl border border-line bg-paper/50">
                      <summary className="px-4 py-3 text-sm font-medium text-ink cursor-pointer select-none">
                        School-wide Top 3 (reference)
                      </summary>
                      <div className="px-4 pb-4 pt-2">
                        <Top3Leaderboard top3={data.schoolTop3} />
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
