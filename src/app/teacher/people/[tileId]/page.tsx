"use client";

/**
 * /teacher/people/[tileId]
 *
 * Student list for a specific people-tile (class-teacher class or subject group).
 * - Search bar only — no class/form/framework filters
 * - Students scoped to this tile only
 * - Each row: attendance dot (green present / red absent / grey not recorded)
 * - Each row: zigzag trend indicator (green +delta if improved, red -delta if declined)
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Avatar, EmptyState } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────
type AttStatus = "PRESENT" | "ABSENT" | "NOT_RECORDED";
type Trend     = "UP" | "DOWN" | "FLAT" | null;

type TileStudent = {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  parentName:      string | null;
  todayAttendance: AttStatus;
  lastScore:       number | null;
  prevScore:       number | null;
  delta:           number | null;
  trend:           Trend;
};

// ── Attendance dot ────────────────────────────────────────────────────────
function AttDot({ status }: { status: AttStatus }) {
  if (status === "PRESENT")
    return (
      <span
        title="Present today"
        className="inline-block w-2.5 h-2.5 rounded-full bg-success ring-2 ring-success/20 shrink-0"
      />
    );
  if (status === "ABSENT")
    return (
      <span
        title="Absent today"
        className="inline-block w-2.5 h-2.5 rounded-full bg-danger ring-2 ring-danger/20 shrink-0"
      />
    );
  return (
    <span
      title="Not recorded today"
      className="inline-block w-2.5 h-2.5 rounded-full bg-slate/30 ring-2 ring-slate/10 shrink-0"
    />
  );
}

// ── SVG zigzag trend line ─────────────────────────────────────────────────
function TrendZigzag({
  trend,
  delta,
}: {
  trend: Trend;
  delta: number | null;
}) {
  if (!trend || trend === "FLAT" || delta === null) {
    return (
      <div className="flex items-center gap-1 min-w-[72px]" title="No change">
        <Minus className="h-3.5 w-3.5 text-slate/40" />
        <span className="text-[11px] text-slate/50 tabular-nums">—</span>
      </div>
    );
  }

  const isUp    = trend === "UP";
  const colour  = isUp ? "#16a34a" : "#dc2626";
  const bgClass = isUp ? "bg-success-bg" : "bg-danger-bg";
  const label   = `${isUp ? "+" : ""}${delta.toFixed(2)}`;

  // Two-point zigzag: prev on left, last on right
  const y1 = isUp ? 22 : 6;
  const y2 = isUp ? 6  : 22;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bgClass} shrink-0`}
      title={`${isUp ? "Improved" : "Declined"} by ${Math.abs(delta).toFixed(2)} pts`}
    >
      {/* Zigzag SVG */}
      <svg width={28} height={28} viewBox="0 0 28 28" fill="none" className="shrink-0">
        {/* Background dots */}
        <circle cx={4}  cy={y1} r={2.5} fill={colour} opacity={0.35} />
        <circle cx={24} cy={y2} r={2.5} fill={colour} opacity={0.35} />
        {/* Line */}
        <line
          x1={4}  y1={y1}
          x2={24} y2={y2}
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* End dot */}
        <circle cx={24} cy={y2} r={3} fill={colour} />
        {/* Arrow head */}
        {isUp ? (
          <>
            <line x1={24} y1={y2} x2={19} y2={y2 + 4} stroke={colour} strokeWidth={2} strokeLinecap="round" />
            <line x1={24} y1={y2} x2={24} y2={y2 + 5} stroke={colour} strokeWidth={2} strokeLinecap="round" />
          </>
        ) : (
          <>
            <line x1={24} y1={y2} x2={19} y2={y2 - 4} stroke={colour} strokeWidth={2} strokeLinecap="round" />
            <line x1={24} y1={y2} x2={24} y2={y2 - 5} stroke={colour} strokeWidth={2} strokeLinecap="round" />
          </>
        )}
      </svg>

      {/* Delta label */}
      <span
        className={`text-[11px] font-semibold tabular-nums ${isUp ? "text-success" : "text-danger"}`}
      >
        {label}
      </span>

      {/* Arrow icon */}
      {isUp ? (
        <TrendingUp className="h-3 w-3 text-success shrink-0" />
      ) : (
        <TrendingDown className="h-3 w-3 text-danger shrink-0" />
      )}
    </div>
  );
}

// ── Legend strip ──────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 bg-slate-50/70 border-b border-line text-[11px] text-slate">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-success" />
        Present today
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-danger" />
        Absent today
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-slate/30" />
        Not recorded
      </span>
      <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-line">
        <TrendingUp className="h-3 w-3 text-success" />
        <span className="text-success font-medium">+pts</span>
        &nbsp;= improved vs last exam
      </span>
      <span className="flex items-center gap-1.5">
        <TrendingDown className="h-3 w-3 text-danger" />
        <span className="text-danger font-medium">−pts</span>
        &nbsp;= declined
      </span>
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-line last:border-0 animate-pulse">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-36 bg-slate-100 rounded" />
            <div className="h-2.5 w-20 bg-slate-100 rounded" />
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5"><div className="h-3 w-16 bg-slate-100 rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-100" /></td>
      <td className="px-5 py-3.5"><div className="h-5 w-20 rounded-full bg-slate-100" /></td>
      <td className="px-5 py-3.5"><div className="h-3 w-4 bg-slate-100 rounded" /></td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function TileStudentsPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const tileId        = params.tileId as string;
  const classId       = searchParams.get("classId")       ?? "";
  const subjectId     = searchParams.get("subjectId")     ?? "";
  const isClassTeacher= searchParams.get("isClassTeacher") === "1";
  const tileTitle     = searchParams.get("title")         ?? "Students";
  const tileSubTitle  = searchParams.get("sub")           ?? "";

  const [students, setStudents] = useState<TileStudent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState("");

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ classId });
      if (subjectId)       qs.set("subjectId", subjectId);
      if (isClassTeacher)  qs.set("isClassTeacher", "1");
      const res = await fetch(`/api/teacher/tile-students?${qs}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't load students."); return; }
      setStudents(data.students ?? []);
    } catch {
      setError("Couldn't load students.");
    } finally {
      setLoading(false);
    }
  }, [classId, subjectId, isClassTeacher]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.trim().toLowerCase();
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q)
    );
  }, [students, search]);

  // Summary counts
  const presentCount     = students.filter((s) => s.todayAttendance === "PRESENT").length;
  const absentCount      = students.filter((s) => s.todayAttendance === "ABSENT").length;
  const notRecordedCount = students.filter((s) => s.todayAttendance === "NOT_RECORDED").length;

  return (
    <div>
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate hover:text-teal transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to People
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text leading-tight">
              {tileTitle}
            </h1>
            {tileSubTitle && (
              <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">{tileSubTitle}</p>
            )}
          </div>

          {/* Today quick-stats */}
          {!loading && students.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-success" />
                <span className="font-semibold text-success">{presentCount}</span>
                <span className="text-slate">present</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-danger" />
                <span className="font-semibold text-danger">{absentCount}</span>
                <span className="text-slate">absent</span>
              </div>
              {notRecordedCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-slate/30" />
                  <span className="font-semibold text-slate">{notRecordedCount}</span>
                  <span className="text-slate">not recorded</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Search bar only — no other filters ─────────────────────────── */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or admission number…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line bg-white text-sm
                     text-ink placeholder:text-slate/40 focus:outline-none focus:border-teal
                     focus:ring-2 focus:ring-teal/15 transition-colors
                     dark:bg-dark-surface dark:border-dark-border dark:text-dark-text
                     dark:placeholder:text-dark-muted/50"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate/40 hover:text-slate transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Result count ───────────────────────────────────────────────── */}
      {!loading && !error && (
        <p className="text-xs text-slate mb-3 dark:text-dark-muted">
          {search ? (
            <>
              <span className="font-medium text-ink dark:text-dark-text">{visible.length}</span>
              {" / "}{students.length} student{students.length !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <span className="font-medium text-ink dark:text-dark-text">{students.length}</span>
              {" "}student{students.length !== 1 ? "s" : ""}
            </>
          )}
        </p>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger mb-4">
          {error}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {!error && (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm
                        dark:bg-dark-surface dark:border-dark-border">
          <Legend />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide
                               dark:bg-dark-border/40 dark:border-dark-border dark:text-dark-muted">
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5 w-[120px]">Adm. No.</th>
                  <th className="px-5 py-3.5 w-[60px]">Today</th>
                  <th className="px-5 py-3.5 w-[160px]">Exam trend</th>
                  <th className="px-5 py-3.5 w-[48px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
                  </>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12">
                      <EmptyState
                        message={
                          search
                            ? "No students match your search."
                            : "No students in this group yet."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  visible.map((s) => (
                    <tr
                      key={s.id}
                      className="group border-b border-line last:border-0 hover:bg-slate-50/60
                                 transition-colors dark:hover:bg-dark-border/20"
                    >
                      {/* Student name + parent */}
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/teacher/students/${s.id}`}
                          className="flex items-center gap-3"
                        >
                          <Avatar name={s.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink group-hover:text-teal
                                         transition-colors truncate dark:text-dark-text">
                              {s.fullName}
                            </p>
                            {s.parentName && (
                              <p className="text-xs text-slate/60 truncate dark:text-dark-muted">
                                {s.parentName}
                              </p>
                            )}
                          </div>
                        </Link>
                      </td>

                      {/* Admission number */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-line
                                         rounded px-1.5 py-0.5 dark:bg-dark-border dark:border-dark-border
                                         dark:text-dark-muted">
                          {s.admissionNumber}
                        </span>
                      </td>

                      {/* Attendance dot */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center">
                          <AttDot status={s.todayAttendance} />
                        </div>
                      </td>

                      {/* Exam trend zigzag */}
                      <td className="px-5 py-3.5">
                        <TrendZigzag trend={s.trend} delta={s.delta} />
                      </td>

                      {/* Navigate arrow */}
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/teacher/students/${s.id}`}
                          className="flex items-center justify-end opacity-0 group-hover:opacity-100
                                     transition-opacity text-slate hover:text-teal"
                          aria-label={`View ${s.fullName}'s profile`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
