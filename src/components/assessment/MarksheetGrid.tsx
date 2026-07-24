"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  scoreToGrade,
  subjectScore,
  gradeColour,
  type KcseGrade,
} from "@/lib/assessment/grading844";
import {
  ErrorBanner,
  EmptyState,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent?: boolean;
  frameworkId?: string;
};

type Paper = {
  id: string;
  name: string;
  maxMarks: number;
  sortOrder: number;
};

type StudentRow = {
  student: { id: string; fullName: string; admissionNumber: string };
  scores: Record<string, number | null>; // paperId → score
};

type MarksheetData = {
  period: Period & { frameworkId: string };
  subject: { id: string; name: string; code: string };
  schoolClass: { id: string; name: string; form: number };
  papers: Paper[];
  rows: StudentRow[];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** All classes the user can pick from. */
  classes: { id: string; name: string }[];
  /** All subjects the user can pick from. */
  subjects: { id: string; name: string }[];
  /** Pre-selected classId (e.g. locked to teacher's own class). */
  defaultClassId?: string;
  /** Pre-selected subjectId. */
  defaultSubjectId?: string;
  /** When true the class selector is hidden. */
  lockClass?: boolean;
  /** When true the subject selector is hidden. */
  lockSubject?: boolean;
  /** Read-only — no save button or cell editing. */
  readOnly?: boolean;
  /**
   * When true the user sees the "+ Paper" button.
   * Principals, HODs, Exam Officers should pass true.
   * Regular teachers pass false (default).
   */
  canManagePapers?: boolean;
};

// ---------------------------------------------------------------------------
// Cell component — a single score input
// ---------------------------------------------------------------------------

function ScoreCell({
  value,
  maxMarks,
  onChange,
  readOnly,
}: {
  value: number | null;
  maxMarks: number;
  onChange: (v: number | null) => void;
  readOnly: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const [error, setError] = useState(false);

  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      setRaw(value === null ? "" : String(value));
      setError(false);
      prevValue.current = value;
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setRaw(text);
    if (text === "") { setError(false); onChange(null); return; }
    const num = parseFloat(text);
    if (isNaN(num) || num < 0 || num > maxMarks) { setError(true); return; }
    setError(false);
    onChange(num);
  }

  if (readOnly) {
    return (
      <span className="text-sm text-ink tabular-nums">
        {value === null ? <span className="text-slate/50">—</span> : value}
      </span>
    );
  }

  return (
    <input
      type="number"
      min={0}
      max={maxMarks}
      step={0.5}
      value={raw}
      onChange={handleChange}
      className={`w-16 rounded-md border px-2 py-1 text-sm tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-teal/20 focus:border-teal transition-colors ${
        error
          ? "border-danger bg-danger-bg/30 text-danger"
          : "border-line bg-white text-ink hover:border-teal/40"
      }`}
      placeholder="—"
    />
  );
}

// ---------------------------------------------------------------------------
// Grade badge
// ---------------------------------------------------------------------------

function GradeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate/50 text-xs">—</span>;
  const { grade } = scoreToGrade(pct);
  const { bg, text } = gradeColour(grade as KcseGrade);
  return (
    <span className={`inline-flex items-center justify-center min-w-[2rem] rounded-md px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
      {grade}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EditableMaxMarks — click the "/80" to change a paper's max marks in-place
// ---------------------------------------------------------------------------

function EditableMaxMarks({
  paperId,
  maxMarks,
  onUpdated,
}: {
  paperId: string;
  maxMarks: number;
  onUpdated: (paperId: string, newMaxMarks: number) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [value,   setValue]     = useState(String(maxMarks));
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync if parent changes the paper (e.g. after add-paper reload)
  useEffect(() => { setValue(String(maxMarks)); }, [maxMarks]);

  function startEdit() { setEditing(true); setValue(String(maxMarks)); setError(false); }

  async function commit() {
    const mm = parseInt(value, 10);
    if (isNaN(mm) || mm < 1 || mm > 9999) { setError(true); inputRef.current?.focus(); return; }
    if (mm === maxMarks) { setEditing(false); return; }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/assessments/papers?paperId=${paperId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxMarks: mm }),
      });
      if (res.ok) { onUpdated(paperId, mm); setEditing(false); }
      else        { setError(true); }
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); setValue(String(maxMarks)); setError(false); }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Click to change max marks"
        onClick={startEdit}
        className="block font-normal text-slate/60 hover:text-teal hover:underline transition-colors cursor-pointer text-xs"
      >
        /{maxMarks}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 mt-0.5">
      <span className="text-slate/60">/</span>
      <input
        ref={inputRef}
        autoFocus
        type="number"
        min={1}
        max={9999}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={`w-14 rounded-md border px-1 py-0 text-xs text-center focus:outline-none focus:ring-2 focus:ring-teal/20 ${
          error
            ? "border-danger text-danger bg-red-50"
            : "border-teal/40 text-ink bg-white"
        }`}
      />
    </span>
  );
}



// ---------------------------------------------------------------------------
// DeletePaperButton — trash icon that asks "are you sure?" inline before
// calling DELETE /api/assessments/papers?paperId=
// ---------------------------------------------------------------------------

function DeletePaperButton({
  paper,
  onDeleted,
}: {
  paper: Paper;
  onDeleted: (paperId: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    setPhase("deleting");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/assessments/papers?paperId=${paper.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok) {
        onDeleted(paper.id);
      } else {
        setErrorMsg(json.error ?? "Couldn't delete paper.");
        setPhase("error");
      }
    } catch {
      setErrorMsg("Couldn't delete paper.");
      setPhase("error");
    }
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        title={`Delete ${paper.name}`}
        onClick={() => setPhase("confirm")}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-slate/40 hover:text-danger hover:bg-danger-bg transition-colors focus:outline-none focus:ring-1 focus:ring-danger/40"
      >
        {/* trash icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.364l.655 7.17A1.75 1.75 0 0 0 5.516 14.5h4.968a1.75 1.75 0 0 0 1.747-1.83l.655-7.17h.364a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
        </svg>
      </button>
    );
  }

  if (phase === "confirm") {
    return (
      <span className="inline-flex items-center gap-1 mt-0.5 flex-wrap justify-center">
        <span className="text-xs text-danger font-medium whitespace-nowrap">Delete?</span>
        <button
          type="button"
          onClick={handleConfirm}
          className="text-xs px-1.5 py-0.5 rounded bg-danger text-white hover:bg-danger/80 transition-colors focus:outline-none focus:ring-1 focus:ring-danger/40"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="text-xs px-1.5 py-0.5 rounded border border-line text-slate hover:bg-paper transition-colors focus:outline-none focus:ring-1 focus:ring-slate/40"
        >
          No
        </button>
      </span>
    );
  }

  if (phase === "deleting") {
    return <span className="text-xs text-slate italic">Deleting…</span>;
  }

  // error phase
  return (
    <span className="inline-flex items-center gap-1 mt-0.5 flex-wrap justify-center">
      <span className="text-xs text-danger truncate max-w-[8rem]" title={errorMsg ?? ""}>{errorMsg}</span>
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="text-xs text-slate underline hover:text-ink"
      >
        Dismiss
      </button>
    </span>
  );
}


function AddPaperModal({
  subjectId,
  frameworkId,
  existingCount,
  onClose,
  onAdded,
}: {
  subjectId: string;
  frameworkId: string;
  existingCount: number;
  onClose: () => void;
  onAdded: (paper: Paper) => void;
}) {
  const defaultName = `Paper ${existingCount + 1}`;
  const [name, setName] = useState(defaultName);
  const [maxMarks, setMaxMarks] = useState("100");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mm = parseInt(maxMarks, 10);
    if (!name.trim()) { setError("Paper name is required."); return; }
    if (isNaN(mm) || mm < 1 || mm > 9999) { setError("Max marks must be between 1 and 9999."); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, frameworkId, name: name.trim(), maxMarks: mm }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Couldn't add paper."); return; }
      onAdded(json.paper as Paper);
    } catch {
      setError("Couldn't add paper.");
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-ink mb-1">Add paper</h2>
        <p className="text-xs text-slate mb-5">
          Teachers enter raw marks; the system converts them to a percentage automatically.
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Paper name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paper 1"
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Out of (max marks)</label>
            <input
              type="number"
              min={1}
              max={9999}
              className={inputClass}
              value={maxMarks}
              onChange={(e) => setMaxMarks(e.target.value)}
              placeholder="100"
            />
            <p className="text-xs text-slate mt-1">
              Teachers enter the raw score (e.g. 47/80). The system calculates the percentage.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClass}
            >
              {saving ? "Adding…" : "Add paper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarksheetGrid({
  classes,
  subjects,
  defaultClassId,
  defaultSubjectId,
  lockClass = false,
  lockSubject = false,
  readOnly = false,
  canManagePapers = false,
}: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [classId, setClassId] = useState<string>(defaultClassId ?? classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? subjects[0]?.id ?? "");

  const [data, setData] = useState<MarksheetData | null>(null);
  const [edits, setEdits] = useState<Map<string, number | null>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Add-paper modal state
  const [showAddPaper, setShowAddPaper] = useState(false);

  // -------------------------------------------------------------------------
  // Load periods on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function fetchPeriods() {
      try {
        const res = await fetch("/api/assessments/periods");
        const json = await res.json();
        if (res.ok && json.periods?.length) {
          setPeriods(json.periods);
          const current = json.periods.find((p: Period) => p.isCurrent) ?? json.periods[0];
          setPeriodId(current.id);
        }
      } catch {
        // silently ignore
      }
    }
    fetchPeriods();
  }, []);

  // -------------------------------------------------------------------------
  // Load marksheet whenever filters change
  // -------------------------------------------------------------------------
  const loadMarksheet = useCallback(async () => {
    if (!periodId || !classId || !subjectId) return;
    setLoading(true);
    setLoadError(null);
    setData(null);
    setEdits(new Map());
    setSavedAt(null);

    try {
      const res = await fetch(
        `/api/assessments/marksheet?periodId=${periodId}&classId=${classId}&subjectId=${subjectId}`
      );
      const json = await res.json();
      if (!res.ok) { setLoadError(json.error ?? "Couldn't load marksheet."); return; }
      setData(json);
    } catch {
      setLoadError("Couldn't load marksheet.");
    } finally {
      setLoading(false);
    }
  }, [periodId, classId, subjectId]);

  useEffect(() => { loadMarksheet(); }, [loadMarksheet]);

  // -------------------------------------------------------------------------
  // Edit handler
  // -------------------------------------------------------------------------
  const handleScoreChange = useCallback((studentId: string, paperId: string, value: number | null) => {
    setEdits((prev) => { const next = new Map(prev); next.set(`${studentId}:${paperId}`, value); return next; });
    setSavedAt(null);
  }, []);

  // Memoised resolver: given a studentId+paperId, returns the pending edit
  // value if one exists, otherwise falls back to the original stored score.
  // Re-created only when the edits Map reference changes.
  const resolveScore = useCallback((studentId: string, paperId: string, original: number | null) => {
    const key = `${studentId}:${paperId}`;
    return edits.has(key) ? edits.get(key)! : original;
  }, [edits]);

  // -------------------------------------------------------------------------
  // Save (batch)
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!data || edits.size === 0) return;
    setSaving(true);
    setSaveError(null);

    const items = Array.from(edits.entries()).map(([key, score]) => {
      const [studentId, paperId] = key.split(":");
      return { periodId, studentId, paperId, score };
    });

    try {
      const res = await fetch("/api/assessments/marksheet/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, items }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? "Couldn't save marks."); return; }
      setSavedAt(Date.now());
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => {
            const newScores = { ...row.scores };
            for (const paper of prev.papers) {
              const key = `${row.student.id}:${paper.id}`;
              if (edits.has(key)) newScores[paper.id] = edits.get(key)!;
            }
            return { ...row, scores: newScores };
          }),
        };
      });
      setEdits(new Map());
    } catch {
      setSaveError("Couldn't save marks.");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Paper added callback — append to current data without a full reload
  // -------------------------------------------------------------------------
  function handlePaperAdded(paper: Paper) {
    setShowAddPaper(false);
    setData((prev) => {
      if (!prev) return prev;
      // Append the new paper column; existing rows get null for this paper
      return {
        ...prev,
        papers: [...prev.papers, paper],
        rows: prev.rows.map((row) => ({
          ...row,
          scores: { ...row.scores, [paper.id]: null },
        })),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Max-marks updated callback — patch the paper in local state
  // -------------------------------------------------------------------------
  function handleMaxMarksUpdated(paperId: string, newMaxMarks: number) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        papers: prev.papers.map((p) =>
          p.id === paperId ? { ...p, maxMarks: newMaxMarks } : p
        ),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Paper deleted callback — remove column from local state
  // -------------------------------------------------------------------------
  function handlePaperDeleted(paperId: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        papers: prev.papers.filter((p) => p.id !== paperId),
        rows: prev.rows.map((row) => {
          const scores = { ...row.scores };
          delete scores[paperId];
          return { ...row, scores };
        }),
      };
    });
    // Drop any unsaved edits for this paper
    setEdits((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.endsWith(`:${paperId}`)) next.delete(key);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const hasEdits = edits.size > 0;
  const currentPeriodLabel = periods.find((p) => p.id === periodId);

  // Memoised array of paper maxMarks — avoids a new array allocation per row
  // in the render loop below.
  const paperMaxMarks = useMemo(
    () => data?.papers.map((p) => p.maxMarks) ?? [],
    [data?.papers]
  );

  // Pre-resolve all scores so each row render reads from a plain array rather
  // than calling resolveScore (which closes over edits Map) multiple times.
  const resolvedRows = useMemo(() => {
    if (!data) return [];
    return data.rows.map((row) => {
      const scores = data.papers.map((p) =>
        resolveScore(row.student.id, p.id, row.scores[p.id] ?? null)
      );
      return { row, scores, pct: subjectScore(scores, paperMaxMarks) };
    });
  }, [data, resolveScore, paperMaxMarks]);

  return (
    <div>
      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        {periods.length > 0 && (
          <div>
            <label className={labelClass}>Assessment period</label>
            <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.academicYear}</option>
              ))}
            </select>
          </div>
        )}

        {!lockClass && classes.length > 1 && (
          <div>
            <label className={labelClass}>Class</label>
            <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {!lockSubject && subjects.length > 1 && (
          <div>
            <label className={labelClass}>Subject</label>
            <select className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ---- Status banners ---- */}
      {savedAt && (
        <div className="mb-3 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-2.5">
          Marks saved successfully.
        </div>
      )}
      {saveError && <ErrorBanner message={saveError} />}
      {loadError && <ErrorBanner message={loadError} />}

      {loading && (
        <div className="mt-4">
          <SkeletonTable rows={8} cols={4} hasAvatar={false} />
        </div>
      )}

      {!loading && data && data.rows.length === 0 && (
        <EmptyState message="No students in this class yet." />
      )}

      {/* ---- Grid ---- */}
      {!loading && data && data.rows.length > 0 && (
        <>
          {currentPeriodLabel && (
            <p className="text-xs text-slate/70 mb-3">
              {data.schoolClass.name} · {data.subject.name} ({data.subject.code}) ·{" "}
              {currentPeriodLabel.name}, {currentPeriodLabel.academicYear}
            </p>
          )}

          <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-slate-50/80 text-left text-xs text-slate font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 w-32 whitespace-nowrap">Adm. No.</th>
                    <th className="px-4 py-3 whitespace-nowrap">Student</th>

                    {/* ── Paper columns ── */}
                    {data.papers.map((p) => (
                      <th key={p.id} className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {p.name}
                          {canManagePapers && !readOnly && (
                            <DeletePaperButton paper={p} onDeleted={handlePaperDeleted} />
                          )}
                        </span>
                        {canManagePapers && !readOnly ? (
                          <EditableMaxMarks
                            paperId={p.id}
                            maxMarks={p.maxMarks}
                            onUpdated={handleMaxMarksUpdated}
                          />
                        ) : (
                          <span className="block font-normal text-slate/60 text-xs">/{p.maxMarks}</span>
                        )}
                      </th>
                    ))}

                    {/* ── Add Paper button ── */}
                    {canManagePapers && !readOnly && (
                      <th className="px-2 py-3 text-center">
                        <button
                          type="button"
                          title="Add paper"
                          onClick={() => setShowAddPaper(true)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal text-white text-sm font-bold hover:bg-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40"
                        >
                          +
                        </button>
                      </th>
                    )}

                    <th className="px-4 py-3 text-center whitespace-nowrap">%</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows.map(({ row, scores: resolvedScores, pct }, i) => {
                    return (
                      <tr
                        key={row.student.id}
                        className={`border-b border-line last:border-0 transition-colors ${
                          i % 2 === 0 ? "bg-white hover:bg-slate-50/30" : "bg-slate-50/20 hover:bg-slate-50/40"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
                            {row.student.admissionNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{row.student.fullName}</td>

                        {data.papers.map((p, pi) => (
                          <td key={p.id} className="px-4 py-3 text-center">
                            <ScoreCell
                              value={resolvedScores[pi]}
                              maxMarks={p.maxMarks}
                              onChange={(v) => handleScoreChange(row.student.id, p.id, v)}
                              readOnly={readOnly}
                            />
                          </td>
                        ))}

                        {/* Empty cell under the + button column */}
                        {canManagePapers && !readOnly && <td />}

                        <td className="px-4 py-3 text-center tabular-nums text-ink">
                          {pct !== null ? (
                            <span className="text-sm font-medium">{Math.round(pct * 10) / 10}%</span>
                          ) : (
                            <span className="text-slate/50 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <GradeBadge pct={pct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- Save bar ---- */}
          {!readOnly && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
              <p className="text-sm">
                {hasEdits ? (
                  <span className="text-amber-700 font-medium">
                    {edits.size} unsaved change{edits.size !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-slate/70">All changes saved.</span>
                )}
              </p>
              <div className="flex gap-2">
                {hasEdits && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => { setEdits(new Map()); setSavedAt(null); }}
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={saving || !hasEdits}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : "Save marks"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Add Paper modal ---- */}
      {showAddPaper && data && (
        <AddPaperModal
          subjectId={data.subject.id}
          frameworkId={data.period.frameworkId}
          existingCount={data.papers.length}
          onClose={() => setShowAddPaper(false)}
          onAdded={handlePaperAdded}
        />
      )}
    </div>
  );
}
