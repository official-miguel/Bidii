"use client";

/**
 * AttendanceView — offline-first attendance taking component.
 *
 * Read path:
 *   1. Student roster comes from studentsStore (IDB-backed) — renders
 *      instantly with zero network requests.
 *   2. Attendance status comes from attendanceStore.loadClassDate() which
 *      reads IDB first, then the store is kept fresh by SSE + background sync.
 *   3. If both stores are empty on first visit (cold load), falls back to the
 *      REST API for the roster while the background sync catches up.
 *
 * Write path:
 *   POST /api/attendance → success → attendanceStore.upsertMany() updates
 *   IDB + in-memory state → SSE event propagates to other open tabs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner, EmptyState, inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { useStudentsStore }   from "@/lib/stores/studentsStore";
import { useAttendanceStore, getAttendanceForClassDate } from "@/lib/stores/attendanceStore";
import type { LocalAttendance } from "@/lib/stores/attendanceStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudentRow = {
  studentId:       string;
  fullName:        string;
  admissionNumber: string;
  present:         boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AttendanceView({
  classes,
  lockClass = false,
}: {
  classes: { id: string; name: string }[];
  lockClass?: boolean;
}) {
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [date,    setDate]    = useState(today());
  const [saving,  setSaving]  = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt,   setSavedAt]   = useState<number | null>(null);

  // ── Store reads ────────────────────────────────────────────────────────────
  // Only subscribe reactively to DATA (students, loading flags).
  // Actions (loadClassDate, upsertMany) are accessed via getState() so their
  // unstable function references never appear in useEffect dependency arrays
  // and cannot cause infinite re-render loops.
  const allStudents       = useStudentsStore((s) => s.students);
  const storesLoading     = useStudentsStore((s) => s.loading);
  const attendanceLoading = useAttendanceStore((s) => s.loading);

  // ── Fallback state for cold-cache visits ──────────────────────────────────
  // If the student store has no entries yet (very first page load, IDB empty),
  // fetch the roster from the API as a one-time fallback.
  const [apiFallbackRows, setApiFallbackRows] = useState<StudentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load attendance records for the selected class + date from IDB ─────────
  useEffect(() => {
    if (!classId) return;
    setSavedAt(null);
    useAttendanceStore.getState().loadClassDate(classId, date).catch(console.error);
  }, [classId, date]);

  // ── Build roster from studentsStore; fall back to API if store is empty ───
  const storeStudents = useMemo(
    () => allStudents
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.admissionNumber.localeCompare(b.admissionNumber, undefined, { numeric: true })),
    [allStudents, classId]
  );

  useEffect(() => {
    // Once the stores finish loading, clear any API fallback — the store is
    // the source of truth from this point on.
    if (!storesLoading && storeStudents.length > 0) {
      setApiFallbackRows(null);
      setLoadError(null);
      return;
    }

    // Only fetch from API if the store has no students for this class yet.
    if (!storesLoading && storeStudents.length === 0 && classId) {
      setLoadError(null);
      const controller = new AbortController();
      fetch(`/api/attendance?classId=${classId}&date=${date}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setLoadError(data.error); setApiFallbackRows([]); return; }
          setApiFallbackRows(
            (data.students ?? []).map((s: {
              studentId: string; fullName: string;
              admissionNumber: string; present: boolean;
            }) => ({
              studentId:       s.studentId,
              fullName:        s.fullName,
              admissionNumber: s.admissionNumber,
              present:         s.present,
            }))
          );
        })
        .catch((err) => {
          if (err.name !== "AbortError") { setLoadError("Couldn't load attendance."); setApiFallbackRows([]); }
        });
      return () => controller.abort();
    }
  }, [storesLoading, storeStudents.length, classId, date]);

  // ── Overlay store attendance status onto the roster ────────────────────────
  // getAttendanceForClassDate returns only records that have been saved
  // (either offline or from the server). Default = PRESENT (checkbox-on)
  // until saved, matching the original behaviour.
  //
  // We subscribe to byClassDate so this component re-renders when records
  // are saved — getAttendanceForClassDate reads from getState() directly.
  const byClassDate = useAttendanceStore((s) => s.byClassDate);
  const storedRecords: LocalAttendance[] = useMemo(
    () => getAttendanceForClassDate(classId, date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, date, byClassDate]
  );
  const storedByStudent = useMemo(
    () => new Map(storedRecords.map((r) => [r.studentId, r])),
    [storedRecords]
  );

  // Local override state so teachers can toggle checkboxes before saving.
  // Initialised from store; reset when classId or date changes.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  useEffect(() => { setOverrides(new Map()); }, [classId, date]);

  // Compute the final visible rows.
  const rows: StudentRow[] = useMemo(() => {
    const source = storeStudents.length > 0
      ? storeStudents.map((s) => ({
          studentId:       s.id,
          fullName:        s.fullName,
          admissionNumber: s.admissionNumber,
          present:         true, // default
        }))
      : (apiFallbackRows ?? []);

    return source.map((s) => {
      // Priority: unsaved local override > saved IDB record > default (present)
      if (overrides.has(s.studentId)) {
        return { ...s, present: overrides.get(s.studentId)! };
      }
      const stored = storedByStudent.get(s.studentId);
      if (stored) return { ...s, present: stored.status === "PRESENT" };
      return s;
    });
  }, [storeStudents, apiFallbackRows, overrides, storedByStudent]);

  // ── Checkbox handlers ──────────────────────────────────────────────────────

  const setPresent = useCallback((studentId: string, present: boolean) => {
    setOverrides((prev) => new Map(prev).set(studentId, present));
  }, []);

  const markAll = useCallback((present: boolean) => {
    setOverrides(new Map(rows.map((r) => [r.studentId, present])));
  }, [rows]);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (rows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/attendance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          date,
          records: rows.map((r) => ({ studentId: r.studentId, present: r.present })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || "Couldn't save attendance."); return; }

      // Merge into the attendance store so other interactions see it immediately.
      const now = new Date().toISOString();
      const localRecords: LocalAttendance[] = rows.map((r) => ({
        id:           storedByStudent.get(r.studentId)?.id ?? `local-${r.studentId}-${date}`,
        schoolId:     "",
        studentId:    r.studentId,
        classId,
        date,
        status:       r.present ? "PRESENT" : "ABSENT",
        recordedById: null,
        createdAt:    now,
        updatedAt:    now,
      }));
      await useAttendanceStore.getState().upsertMany(localRecords);

      // Clear overrides — store is now the source of truth.
      setOverrides(new Map());
      setSavedAt(Date.now());
    } catch {
      setSaveError("Couldn't save attendance.");
    } finally {
      setSaving(false);
    }
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const presentCount = rows.filter((r) => r.present).length;
  const absentCount  = rows.length - presentCount;

  // Show the loading spinner only during the brief IDB hydration window.
  const showLoading = (storesLoading || attendanceLoading) && rows.length === 0 && !apiFallbackRows;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        {!lockClass && classes.length > 1 && (
          <div>
            <label className={labelClass}>Class</label>
            <select
              className={inputClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            className={inputClass}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {rows.length > 0 && (
          <div className="flex gap-4 pb-0.5">
            <button type="button" className="text-sm text-royal hover:underline" onClick={() => markAll(true)}>
              Mark all present
            </button>
            <button type="button" className="text-sm text-slate hover:underline" onClick={() => markAll(false)}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Status banners */}
      {savedAt && (
        <div className="mb-4 rounded-md bg-success-bg text-success text-sm px-3 py-2">
          Attendance saved.
        </div>
      )}
      {saveError  && <ErrorBanner message={saveError} />}
      {loadError  && <ErrorBanner message={loadError} />}

      {/* Roster */}
      {!classId ? (
        <EmptyState message="No class available yet." />
      ) : showLoading ? (
        <p className="text-slate text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No students in this class yet." />
      ) : (
        <>
          <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                    <th className="px-5 py-3.5 w-[130px]">Adm. No.</th>
                    <th className="px-5 py-3.5">Name</th>
                    <th className="px-5 py-3.5 w-[140px]">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.studentId}
                      className={`border-b border-line last:border-0 cursor-pointer transition-colors ${
                        r.present ? "hover:bg-slate-50/50" : "bg-danger-bg/20 hover:bg-danger-bg/30"
                      }`}
                      onClick={() => setPresent(r.studentId, !r.present)}
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
                          {r.admissionNumber}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-ink">{r.fullName}</td>
                      <td className="px-5 py-3.5">
                        <label
                          className="inline-flex items-center gap-2 text-sm cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-teal cursor-pointer rounded border-line"
                            checked={r.present}
                            onChange={(e) => setPresent(r.studentId, e.target.checked)}
                          />
                          <span className={`font-medium ${r.present ? "text-success" : "text-danger"}`}>
                            {r.present ? "Present" : "Absent"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
            <p className="text-sm">
              <span className="text-success font-semibold">{presentCount} present</span>
              {" · "}
              <span className="text-danger font-semibold">{absentCount} absent</span>
              {" · "}
              <span className="text-slate">{rows.length} students</span>
            </p>
            <button className={primaryButtonClass} disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save attendance"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
