"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Plus, Filter, X } from "lucide-react";
import StudentWorkspace from "./StudentWorkspace";
import QuickIncidentModal from "./QuickIncidentModal";
import {
  Avatar,
  DisciplineRecord,
  StudentLite,
  STATUS_BADGE,
  STATUS_LABELS,
  Skeleton,
  StatCard,
  fmtDate,
  offenceIcon,
} from "./shared";

type ClassLite = { id: string; name: string; form: number; stream?: string | null };

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function EmptyBlock({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-16 text-center">
      <ShieldAlert className="h-10 w-10 text-slate/30 mx-auto mb-3" aria-hidden />
      <p className="text-sm text-slate">{text}</p>
      {action && (
        <button
          type="button"
          className="mt-4 text-sm px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── Status badge pill ──────────────────────────────────────────────────── */
function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_BADGE[status] ?? "bg-line text-slate"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Pure incident row ───────────────────────────────────────────────────── */
const IncidentRow = memo(function IncidentRow({
  record,
  caseHrefBase,
  onViewStudent,
}: {
  record: DisciplineRecord;
  caseHrefBase?: string;
  onViewStudent: (s: StudentLite) => void;
}) {
  const icon = offenceIcon(record.offence + " " + (record.aiSummary || ""));
  return (
    <li>
      <div className="bg-card border border-line rounded-xl px-4 py-3.5 hover:border-teal/30 hover:shadow-sm transition-all flex items-start gap-3 group">
        {/* offence icon */}
        <span
          className="mt-0.5 w-9 h-9 rounded-lg bg-danger-bg/50 flex items-center justify-center text-base shrink-0"
          aria-hidden
        >
          {icon}
        </span>

        {/* main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{record.offence}</span>
            <StatusPill status={record.status} />
            {record._count.files > 0 && (
              <span className="text-xs text-slate" title={`${record._count.files} attachment(s)`}>
                📎 {record._count.files}
              </span>
            )}
            {record._count.caseNotes > 0 && (
              <span className="text-xs text-slate" title={`${record._count.caseNotes} note(s)`}>
                💬 {record._count.caseNotes}
              </span>
            )}
          </div>
          {record.aiSummary && (
            <p className="text-xs text-royal mt-0.5 truncate">✨ {record.aiSummary}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              type="button"
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              onClick={() => onViewStudent(record.student)}
              title="View student profile"
            >
              <Avatar name={record.student.fullName} size="sm" />
              <span className="text-xs font-medium text-ink">{record.student.fullName}</span>
              <span className="text-xs text-slate font-mono">{record.student.admissionNumber}</span>
            </button>
            {record.student.schoolClass && (
              <span className="text-xs text-slate">· {record.student.schoolClass.name}</span>
            )}
            {record.recordedBy && (
              <span className="text-xs text-slate/60">· by {record.recordedBy.email}</span>
            )}
          </div>
        </div>

        {/* right side */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-slate">{fmtDate(record.dateOfOffence)}</span>
          {caseHrefBase && (
            <Link
              href={`${caseHrefBase}/${record.id}`}
              className="text-xs text-royal hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              Open case →
            </Link>
          )}
        </div>
      </div>
    </li>
  );
});

/* ── Main export ─────────────────────────────────────────────────────────── */
export default function DisciplineDashboard({
  canManage,
  caseHrefBase,
}: {
  canManage: boolean;
  caseHrefBase?: string;
}) {
  const [records, setRecords] = useState<DisciplineRecord[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);

  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 250);
  const [classId, setClassId] = useState("");
  const [stream, setStream] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasFiles, setHasFiles] = useState(false);
  const [hasAi, setHasAi] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [workspaceStudent, setWorkspaceStudent] = useState<StudentLite | null>(null);
  const [incidentModal, setIncidentModal] = useState<{ studentId?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    await Promise.all([
      fetch("/api/students").then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setStudents(
            data.map((s: StudentLite) => ({
              id: s.id,
              fullName: s.fullName,
              admissionNumber: s.admissionNumber,
              schoolClass: s.schoolClass || null,
            }))
          );
        }
      }),
      fetch("/api/classes").then(async (r) => {
        if (r.ok) setClasses(await r.json());
      }),
      fetch("/api/discipline").then(async (r) => {
        setRecords(r.ok ? await r.json() : []);
      }),
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const loading = records === null;

  const streams = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => c.stream && set.add(c.stream));
    return [...set].sort();
  }, [classes]);

  const stats = useMemo(() => {
    const open = records?.filter((r) => r.status === "OPEN").length ?? 0;
    const underReview = records?.filter((r) => r.status === "UNDER_REVIEW").length ?? 0;
    const resolved = records?.filter((r) => r.status === "RESOLVED").length ?? 0;
    const escalated = records?.filter((r) => r.status === "ESCALATED").length ?? 0;
    return { total: records?.length ?? 0, open, underReview, resolved, escalated };
  }, [records]);

  const matchesStudent = useCallback(
    (s: StudentLite) => {
      if (classId && s.schoolClass?.id !== classId) return false;
      if (stream && s.schoolClass?.stream !== stream) return false;
      return true;
    },
    [classId, stream]
  );

  const inDateRange = useCallback(
    (d: string) => {
      const day = d.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    },
    [dateFrom, dateTo]
  );

  const filtered = useMemo(() => {
    if (!records) return [];
    return records.filter((r) => {
      if (!matchesStudent(r.student)) return false;
      if (status && r.status !== status) return false;
      if (!inDateRange(r.dateOfOffence)) return false;
      if (hasFiles && r._count.files === 0) return false;
      if (hasAi && !r.aiSummary) return false;
      if (q) {
        const hay =
          `${r.student.fullName} ${r.student.admissionNumber} ${r.student.schoolClass?.name || ""} ${r.offence} ${r.description || ""} ${r.aiSummary || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, q, status, matchesStudent, inDateRange, hasFiles, hasAi]);

  const activeFilters = !!(classId || stream || status || dateFrom || dateTo || hasFiles || hasAi);

  function clearFilters() {
    setClassId("");
    setStream("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setHasFiles(false);
    setHasAi(false);
  }

  function saved() {
    setIncidentModal(null);
    setRefreshKey((k) => k + 1);
  }

  const handleViewStudent = useCallback((s: StudentLite) => setWorkspaceStudent(s), []);

  return (
    <div>
      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total cases"
          value={stats.total}
          icon={<ShieldAlert className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Open"
          value={stats.open}
          icon={<span aria-hidden>⏳</span>}
          loading={loading}
        />
        <StatCard
          label="Under review"
          value={stats.underReview}
          icon={<span aria-hidden>🔍</span>}
          loading={loading}
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<span aria-hidden>✅</span>}
          loading={loading}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-xl p-3 mb-5 space-y-3">
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate text-sm select-none"
              aria-hidden
            >
              🔍
            </span>
            <input
              className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-2 text-sm text-ink placeholder:text-slate focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              placeholder="Search by student, admission no., offence, or AI summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search discipline cases"
            />
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || activeFilters
                ? "border-teal bg-teal/5 text-teal"
                : "border-line text-slate hover:text-ink hover:border-slate/40"
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters
            {activeFilters && (
              <span className="ml-0.5 h-4 w-4 rounded-full bg-teal text-white text-[9px] font-bold flex items-center justify-center">
                !
              </span>
            )}
          </button>

          {/* Add incident */}
          {canManage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors shrink-0"
              onClick={() => setIncidentModal({})}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Record Incident</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>

        {/* Expandable filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
            <select
              className={selectClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {streams.length > 0 && (
              <select
                className={selectClass}
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                aria-label="Filter by stream"
              >
                <option value="">All streams</option>
                {streams.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>

            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <span className="text-xs text-slate">to</span>
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />

            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasFiles}
                onChange={(e) => setHasFiles(e.target.checked)}
              />
              Has attachments
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasAi}
                onChange={(e) => setHasAi(e.target.checked)}
              />
              Has AI summary
            </label>

            {activeFilters && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-royal hover:underline"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-slate mb-3 px-0.5">
          {filtered.length === 0
            ? "No cases"
            : `${filtered.length} case${filtered.length !== 1 ? "s" : ""}`}
          {activeFilters || q ? " matching current filters" : ""}
        </p>
      )}

      {/* ── Case list ───────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_264px] gap-5 items-start">
        <div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyBlock
              text={
                q || activeFilters
                  ? "No discipline cases match your search or filters."
                  : "No discipline cases recorded yet."
              }
              action={
                canManage && !q && !activeFilters
                  ? { label: "Record First Incident", onClick: () => setIncidentModal({}) }
                  : undefined
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((r) => (
                <IncidentRow
                  key={r.id}
                  record={r}
                  caseHrefBase={caseHrefBase}
                  onViewStudent={handleViewStudent}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Sidebar: quick stats by status ─────────────────────────── */}
        <aside className="hidden lg:block space-y-4">
          {/* Status breakdown */}
          <div className="bg-card border border-line rounded-xl p-4">
            <h2 className="text-sm font-semibold text-ink mb-3">By status</h2>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(STATUS_LABELS).map(([v, l]) => {
                  const count = records?.filter((r) => r.status === v).length ?? 0;
                  return (
                    <button
                      key={v}
                      type="button"
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        status === v
                          ? "bg-teal/10 text-teal font-medium"
                          : "text-slate hover:bg-paper"
                      }`}
                      onClick={() => setStatus((s) => (s === v ? "" : v))}
                      aria-pressed={status === v}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            STATUS_BADGE[v]?.includes("warn")
                              ? "bg-warn"
                              : STATUS_BADGE[v]?.includes("success")
                                ? "bg-success"
                                : STATUS_BADGE[v]?.includes("danger")
                                  ? "bg-danger"
                                  : "bg-royal"
                          }`}
                        />
                        {l}
                      </span>
                      <span className="font-semibold text-ink">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent cases */}
          <div className="bg-card border border-line rounded-xl p-4">
            <h2 className="text-sm font-semibold text-ink mb-3">Recent cases</h2>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : records?.length === 0 ? (
              <p className="text-xs text-slate">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {(records ?? []).slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full text-left flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-paper transition-colors"
                      onClick={() => handleViewStudent(r.student)}
                    >
                      <span className="text-sm mt-0.5" aria-hidden>
                        {offenceIcon(r.offence)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-ink truncate">
                          {r.student.fullName.split(" ")[0]} — {r.offence}
                        </span>
                        <span className="block text-[11px] text-slate">
                          {fmtDate(r.dateOfOffence)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── Student workspace drawer ─────────────────────────────────────── */}
      {workspaceStudent && (
        <StudentWorkspace
          student={workspaceStudent}
          canManageDiscipline={canManage}
          canManageAchievements={false}
          caseHrefBase={caseHrefBase}
          refreshKey={refreshKey}
          onClose={() => setWorkspaceStudent(null)}
          onRecordIncident={() =>
            setIncidentModal({ studentId: workspaceStudent.id })
          }
          onAddAchievement={() => {}}
        />
      )}

      {/* ── Quick incident modal ─────────────────────────────────────────── */}
      {incidentModal && (
        <QuickIncidentModal
          students={students}
          initialStudentId={incidentModal.studentId}
          onClose={() => setIncidentModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
