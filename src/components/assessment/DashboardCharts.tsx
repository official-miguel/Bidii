"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { gradeColour, ALL_GRADES, type KcseGrade } from "@/lib/assessment/grading844";
import { ErrorBanner, EmptyState, inputClass, labelClass } from "@/components/ui";
import AssessmentAiPanel from "@/components/assessment/AssessmentAiPanel";

// ---------------------------------------------------------------------------
// Types (mirrors the /api/assessments/dashboard response shape)
// ---------------------------------------------------------------------------

type Period = {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent?: boolean;
};

type SubjectPerformance = {
  subject: { id: string; name: string; code: string };
  meanScore: number | null;
  meanPoints: number | null;
  meanGrade: KcseGrade | null;
  studentCount: number;
};

type GradeDistEntry = { grade: KcseGrade; count: number };

type ClassComparison = {
  schoolClass: { id: string; name: string; form: number };
  meanPoints: number | null;
  meanGrade: KcseGrade | null;
  countA: number;
  countE: number;
  studentCount: number;
};

type TrendEntry = {
  period: { id: string; name: string; academicYear: string };
  meanPoints: number | null;
};

type HeatmapRow = {
  subjectId: string;
  subjectName: string;
  classes: { classId: string; className: string; meanScore: number | null }[];
};

type DashboardData = {
  filters: {
    periodId: string;
    classId?: string;
    subjectId?: string;
    form?: number;
  };
  summary: {
    overallMeanGrade: KcseGrade | null;
    overallMeanPoints: number | null;
    studentCount: number;
  };
  subjectPerformance: SubjectPerformance[];
  gradeDistribution: GradeDistEntry[];
  classComparison: ClassComparison[];
  trendData: TrendEntry[];
  subjectClassHeatmap: HeatmapRow[];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  classes: { id: string; name: string; form: number }[];
  subjects: { id: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Small chart helpers (pure CSS bar charts — no external lib)
// ---------------------------------------------------------------------------

function HBar({
  value,
  max,
  colour,
}: {
  value: number;
  max: number;
  colour: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate w-8 text-right">{value}</span>
    </div>
  );
}

const MiniBar = memo(function MiniBar({
  value,
  max,
  label,
  selected,
  onClick,
}: {
  value: number;
  max: number;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const clickable = !!onClick && value > 0;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      title={clickable ? `${value} student${value !== 1 ? "s" : ""} with grade ${label} — click to view` : undefined}
      className={`flex flex-col items-center gap-1 min-w-[28px] rounded focus:outline-none focus:ring-1 focus:ring-royal/40 transition-opacity ${
        clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
      } ${selected ? "ring-2 ring-royal rounded" : ""}`}
    >
      <span className="text-[10px] tabular-nums text-slate">{value > 0 ? value : ""}</span>
      <div
        className={`w-5 rounded-sm overflow-hidden transition-colors ${selected ? "bg-royal/20" : "bg-line"}`}
        style={{ height: 48 }}
      >
        <div
          className={`w-full rounded-sm ${selected ? "bg-royal" : "bg-royal/60"}`}
          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${selected ? "text-royal" : "text-slate"}`}>{label}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <h3 className="text-sm font-semibold text-ink mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heat-map colour for a score 0–100
// ---------------------------------------------------------------------------

function heatColour(score: number | null): string {
  if (score === null) return "bg-paper text-slate";
  if (score >= 75) return "bg-green-100 text-green-800";
  if (score >= 60) return "bg-blue-100 text-blue-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  if (score >= 40) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardCharts({ classes, subjects }: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [form, setForm] = useState("");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Grade drill-down ----
  type DrillStudent = {
    admissionNumber: string;
    fullName: string;
    className: string;
    meanPoints: number;
    meanGradeLabel: KcseGrade;
  };
  const [selectedGrade, setSelectedGrade] = useState<KcseGrade | null>(null);
  const [drillStudents, setDrillStudents] = useState<DrillStudent[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // ---- Load periods on mount ----
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/assessments/periods");
        const json = await res.json();
        if (res.ok && json.periods?.length) {
          setPeriods(json.periods);
          const current = json.periods.find((p: Period) => p.isCurrent) ?? json.periods[0];
          setPeriodId(current.id);
        }
      } catch {
        // silently handled below
      }
    }
    load();
  }, []);

  // ---- Load dashboard data whenever filters change ----
  useEffect(() => {
    if (!periodId) return;

    const params = new URLSearchParams({ periodId });
    if (classId) params.set("classId", classId);
    if (subjectId) params.set("subjectId", subjectId);
    if (form) params.set("form", form);

    setLoading(true);
    setError(null);
    setData(null);
    setSelectedGrade(null);
    setDrillStudents([]);

    fetch(`/api/assessments/dashboard?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      })
      .catch(() => setError("Couldn't load dashboard data."))
      .finally(() => setLoading(false));
  }, [periodId, classId, subjectId, form]);

  // ---- Grade bar click ----
  async function handleGradeClick(grade: KcseGrade) {
    // Toggle off if already selected
    if (selectedGrade === grade) {
      setSelectedGrade(null);
      setDrillStudents([]);
      return;
    }
    setSelectedGrade(grade);
    setDrillStudents([]);
    setDrillError(null);
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ periodId, grade });
      if (classId) params.set("classId", classId);
      if (subjectId) params.set("subjectId", subjectId);
      if (form) params.set("form", form);
      const res = await fetch(`/api/assessments/dashboard/grade-students?${params}`);
      const json = await res.json();
      if (!res.ok) { setDrillError(json.error ?? "Couldn't load students."); }
      else { setDrillStudents(json.students ?? []); }
    } catch {
      setDrillError("Couldn't load students.");
    } finally {
      setDrillLoading(false);
    }
  }

  // ---- Derived ----
  const gradeDist = data?.gradeDistribution ?? [];
  const maxGradeCount = Math.max(...gradeDist.map((g) => g.count), 1);
  const totalStudents = data?.summary.studentCount ?? 0;

  const trendMax = Math.max(
    ...(data?.trendData.map((t) => t.meanPoints ?? 0) ?? []),
    1
  );

  const sortedSubjectPerformance = useMemo(
    () => data ? [...data.subjectPerformance].sort((a, b) => (b.meanScore ?? 0) - (a.meanScore ?? 0)) : [],
    [data]
  );

  const sortedClassComparison = useMemo(
    () => data ? [...data.classComparison].sort((a, b) => (b.meanPoints ?? 0) - (a.meanPoints ?? 0)) : [],
    [data]
  );

  const gradeBarClickHandlers = useMemo(() => {
    const handlers: Partial<Record<string, () => void>> = {};
    for (const grade of ALL_GRADES) {
      handlers[grade] = () => handleGradeClick(grade);
    }
    return handlers;
    // handleGradeClick is defined inside the component and stable across renders
    // since it only reads from state values that change data anyway
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, classId, subjectId, form]);

  return (
    <div>
      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        {periods.length > 0 && (
          <div>
            <label className={labelClass}>Period</label>
            <select
              className={inputClass}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.academicYear}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>Class</label>
          <select
            className={inputClass}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Subject</label>
          <select
            className={inputClass}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Form</label>
          <select
            className={inputClass}
            value={form}
            onChange={(e) => setForm(e.target.value)}
          >
            <option value="">All forms</option>
            {[1, 2, 3, 4].map((f) => (
              <option key={f} value={f}>
                Form {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && (
        <p className="text-slate text-sm">Loading analytics…</p>
      )}

      {!loading && data && totalStudents === 0 && (
        <EmptyState message="No marks entered for this period yet." />
      )}

      {!loading && data && totalStudents > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ---- Summary card ---- */}
          <Section title="Overall summary">
            <div className="flex items-center gap-6">
              {data.summary.overallMeanGrade && (() => {
                const { bg, text } = gradeColour(data.summary.overallMeanGrade);
                return (
                  <div
                    className={`flex flex-col items-center justify-center rounded-xl w-24 h-24 ${bg}`}
                  >
                    <span className={`text-4xl font-display font-bold ${text}`}>
                      {data.summary.overallMeanGrade}
                    </span>
                    <span className={`text-xs mt-0.5 ${text}`}>Mean grade</span>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-ink">
                  <span className="font-semibold tabular-nums">
                    {data.summary.overallMeanPoints?.toFixed(2) ?? "—"}
                  </span>{" "}
                  <span className="text-slate">mean points</span>
                </p>
                <p className="text-sm text-ink">
                  <span className="font-semibold tabular-nums">{totalStudents}</span>{" "}
                  <span className="text-slate">students assessed</span>
                </p>
              </div>
            </div>
          </Section>

          {/* ---- Grade distribution ---- */}
          <Section title="Grade distribution">
            <div className="flex items-end gap-1 h-16 mb-2">
              {ALL_GRADES.map((grade) => {
                const entry = gradeDist.find((g) => g.grade === grade);
                const count = entry?.count ?? 0;
                return (
                  <MiniBar
                    key={grade}
                    value={count}
                    max={maxGradeCount}
                    label={grade}
                    selected={selectedGrade === grade}
                    onClick={gradeBarClickHandlers[grade]}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-slate mt-1">Click a bar to see students in that grade</p>
          </Section>

          {/* ---- Grade drill-down — full width so left-column cards never shift ---- */}
          {selectedGrade && (
            <div className="md:col-span-2 bg-white border border-royal/30 rounded-xl p-5">
              {(() => {
                const { bg, text } = gradeColour(selectedGrade);
                return (
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center rounded-lg w-8 h-8 text-sm font-bold ${bg} ${text}`}>
                        {selectedGrade}
                      </span>
                      <span className="text-sm font-semibold text-ink">
                        Grade {selectedGrade} students
                      </span>
                      {!drillLoading && (
                        <span className="text-xs text-slate">
                          — {drillStudents.length} student{drillStudents.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {drillLoading && (
                        <span className="text-xs text-slate italic">Loading…</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedGrade(null); setDrillStudents([]); }}
                      className="text-xs text-slate hover:text-ink transition-colors px-2 py-1 rounded hover:bg-paper"
                    >
                      ✕ Close
                    </button>
                  </div>
                );
              })()}

              {drillError && (
                <p className="text-xs text-danger">{drillError}</p>
              )}

              {!drillLoading && !drillError && drillStudents.length === 0 && (
                <p className="text-xs text-slate">No students found for this grade.</p>
              )}

              {!drillLoading && drillStudents.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-slate text-left">
                        <th className="pb-1.5 font-medium">Adm. No.</th>
                        <th className="pb-1.5 font-medium">Name</th>
                        <th className="pb-1.5 font-medium">Class</th>
                        <th className="pb-1.5 font-medium text-right">Mean pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillStudents.map((s) => (
                        <tr key={s.admissionNumber} className="border-b border-line last:border-0">
                          <td className="py-1.5 pr-2 tabular-nums text-slate">{s.admissionNumber}</td>
                          <td className="py-1.5 pr-2 font-medium text-ink">{s.fullName}</td>
                          <td className="py-1.5 pr-2 text-slate">{s.className}</td>
                          <td className="py-1.5 tabular-nums text-ink text-right">{s.meanPoints.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- Subject performance ---- */}
          <Section title="Subject mean grades">
            {data.subjectPerformance.length === 0 ? (
              <p className="text-sm text-slate">No subject data yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedSubjectPerformance.map((sp) => {
                    const { bg, text } =
                      sp.meanGrade ? gradeColour(sp.meanGrade) : { bg: "bg-paper", text: "text-slate" };
                    return (
                      <div key={sp.subject.id} className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center justify-center rounded w-7 h-6 text-xs font-semibold shrink-0 ${bg} ${text}`}
                        >
                          {sp.meanGrade ?? "—"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-ink truncate">
                            {sp.subject.name}
                          </p>
                          <HBar
                            value={Math.round(sp.meanScore ?? 0)}
                            max={100}
                            colour="bg-royal"
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate w-10 text-right shrink-0">
                          {sp.meanScore !== null ? `${sp.meanScore.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </Section>

          {/* ---- Class comparison ---- */}
          <Section title="Class comparison">
            {data.classComparison.length === 0 ? (
              <p className="text-sm text-slate">No class data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-slate text-left">
                      <th className="pb-2 font-medium">Class</th>
                      <th className="pb-2 font-medium text-center">Students</th>
                      <th className="pb-2 font-medium text-center">Mean pts</th>
                      <th className="pb-2 font-medium text-center">Grade</th>
                      <th className="pb-2 font-medium text-center text-success">A/A-</th>
                      <th className="pb-2 font-medium text-center text-danger">E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClassComparison.map((cc) => {
                        const { bg, text } =
                          cc.meanGrade
                            ? gradeColour(cc.meanGrade)
                            : { bg: "bg-paper", text: "text-slate" };
                        return (
                          <tr
                            key={cc.schoolClass.id}
                            className="border-b border-line last:border-0"
                          >
                            <td className="py-1.5 pr-2 font-medium text-ink">
                              {cc.schoolClass.name}
                            </td>
                            <td className="py-1.5 text-center text-slate">
                              {cc.studentCount}
                            </td>
                            <td className="py-1.5 text-center tabular-nums text-ink">
                              {cc.meanPoints?.toFixed(2) ?? "—"}
                            </td>
                            <td className="py-1.5 text-center">
                              <span
                                className={`inline-block rounded px-1 py-0.5 text-[11px] font-semibold ${bg} ${text}`}
                              >
                                {cc.meanGrade ?? "—"}
                              </span>
                            </td>
                            <td className="py-1.5 text-center text-success tabular-nums">
                              {cc.countA}
                            </td>
                            <td className="py-1.5 text-center text-danger tabular-nums">
                              {cc.countE}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ---- Trend ---- */}
          {data.trendData.length > 1 && (
            <Section title="Mean grade trend (all periods)">
              <div className="flex items-end gap-2 h-16">
                {data.trendData.map((t) => {
                  const pts = t.meanPoints ?? 0;
                  const pct = trendMax > 0 ? (pts / trendMax) * 100 : 0;
                  return (
                    <div key={t.period.id} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[10px] tabular-nums text-slate">
                        {pts > 0 ? pts.toFixed(1) : ""}
                      </span>
                      <div
                        className="w-full bg-line rounded-sm overflow-hidden"
                        style={{ height: 36 }}
                      >
                        <div
                          className="w-full bg-royal/70 rounded-sm transition-all"
                          style={{
                            height: `${pct}%`,
                            marginTop: `${100 - pct}%`,
                          }}
                        />
                      </div>
                      <span
                        className="text-[10px] text-slate text-center leading-tight"
                        style={{ maxWidth: 40, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                        title={t.period.name}
                      >
                        {t.period.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ---- Subject × class heat-map ---- */}
          {data.subjectClassHeatmap.length > 0 &&
            data.subjectClassHeatmap[0].classes.length > 1 && (
              <Section title="Subject × class heat-map (mean %)">
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-line text-slate text-left">
                        <th className="pb-2 font-medium pr-3">Subject</th>
                        {data.subjectClassHeatmap[0].classes.map((c) => (
                          <th
                            key={c.classId}
                            className="pb-2 font-medium text-center px-1"
                          >
                            {c.className}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjectClassHeatmap.map((row) => (
                        <tr
                          key={row.subjectId}
                          className="border-b border-line last:border-0"
                        >
                          <td className="py-1 pr-3 font-medium text-ink whitespace-nowrap">
                            {row.subjectName}
                          </td>
                          {row.classes.map((c) => (
                            <td key={c.classId} className="py-1 px-1 text-center">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${heatColour(c.meanScore)}`}
                              >
                                {c.meanScore !== null
                                  ? `${c.meanScore.toFixed(0)}%`
                                  : "—"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

        </div>
      )}

      {/* ---- AI Insights panel — lazy-mounted once a period is selected ---- */}
      {periodId && (
        <AssessmentAiPanel
          periodId={periodId}
          classId={classId}
          framework="8-4-4"
        />
      )}
    </div>
  );
}
