"use client";
/**
 * SlotEditModal — edit or add a single timetable slot.
 * Shows live conflict preview before the user confirms.
 * Teacher list includes availability indicators (unavailable, overloaded).
 */
import { useState, useMemo, useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Modal from "@/components/Modal";
import {
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass, ErrorBanner,
} from "@/components/ui";
import {
  detectLiveConflicts, classKey, type LiveSlot, type ConflictEngineConfig,
} from "@/lib/ai/timetableConflictEngine";

export type TeacherOption = {
  id:        string;
  fullName:  string;
  isEligible:boolean;           // assigned to this subject
  isBusy:    boolean;           // already booked in this slot
  isUnavailable: boolean;       // marked unavailable this slot
};

type Props = {
  /** null = add mode, non-null = edit mode */
  slot: LiveSlot | null;
  targetDay:    number;
  targetPeriod: number;
  classId:      string;
  className:    string;
  subjects:     Array<{ id: string; name: string; code: string }>;
  teachers:     TeacherOption[];
  allSlots:     LiveSlot[];       // current full timetable for live preview
  conflictCfg:  ConflictEngineConfig;
  saving:       boolean;
  error:        string | null;
  onSave:       (subjectId: string, teacherId: string, room: string | null) => void;
  onClose:      () => void;
};

export default function SlotEditModal({
  slot, targetDay, targetPeriod, classId, className,
  subjects, teachers, allSlots, conflictCfg,
  saving, error, onSave, onClose,
}: Props) {
  const [subjectId, setSubjectId] = useState(slot?.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(slot?.teacherId ?? "");
  const [room,      setRoom]      = useState(slot?.room ?? "");

  useEffect(() => {
    setSubjectId(slot?.subjectId ?? "");
    setTeacherId(slot?.teacherId ?? "");
    setRoom(slot?.room ?? "");
  }, [slot]);

  const eligible = useMemo(
    () => teachers.filter((t) => t.isEligible),
    [teachers]
  );

  // Build a preview slot and run conflict detection client-side
  const previewConflicts = useMemo(() => {
    if (!subjectId || !teacherId) return null;
    const sub = subjects.find((s) => s.id === subjectId);
    if (!sub) return null;

    // Replace or add the preview slot
    const preview: LiveSlot = {
      id: slot?.id ?? "__preview__",
      classId, className, dayOfWeek: targetDay, period: targetPeriod,
      subjectId, subjectCode: sub.code, teacherId,
      teacherName: teachers.find((t) => t.id === teacherId)?.fullName ?? "",
      room: room || null, isDouble: false,
      isManual: true, isLocked: false,
    };

    const withPreview = slot
      ? allSlots.map((s) => (s.id === slot.id ? preview : s))
      : [...allSlots, preview];

    const result = detectLiveConflicts(withPreview, conflictCfg);
    const ck     = classKey(classId, targetDay, targetPeriod);
    return result.conflictMap.get(ck) ?? [];
  }, [subjectId, teacherId, room, slot, allSlots, conflictCfg, classId, className, targetDay, targetPeriod, subjects, teachers]);

  const hasBlocker = previewConflicts?.some((c) => c.severity === "error") ?? false;

  const dayLabel = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][targetDay] ?? `Day ${targetDay}`;
  const title    = slot ? `Edit lesson — ${dayLabel} · P${targetPeriod}` : `Add lesson — ${dayLabel} · P${targetPeriod}`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        {/* Subject */}
        <div>
          <label className={labelClass}>Subject <span className="text-danger">*</span></label>
          <select value={subjectId}
            onChange={(e) => { setSubjectId(e.target.value); setTeacherId(""); }}
            className={inputClass}>
            <option value="">Select a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>

        {/* Teacher */}
        <div>
          <label className={labelClass}>Teacher <span className="text-danger">*</span></label>
          {!subjectId ? (
            <p className="text-xs text-slate mt-1">Choose a subject first.</p>
          ) : eligible.length === 0 ? (
            <p className="text-xs text-warn mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              No teacher is assigned to this subject. Assign one from Staff first.
            </p>
          ) : (
            <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto">
              {eligible.map((t) => {
                const active = teacherId === t.id;
                const status =
                  t.isBusy        ? "busy" :
                  t.isUnavailable ? "unavail" : "free";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTeacherId(t.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left
                      transition-colors text-sm
                      ${active
                        ? "bg-teal/10 border-teal text-ink"
                        : status === "busy"
                          ? "bg-danger/5 border-danger/30 text-ink"
                          : status === "unavail"
                            ? "bg-warn-bg border-warn/30 text-ink"
                            : "bg-white border-line text-ink hover:border-teal/40"
                      }`}
                    aria-pressed={active}
                  >
                    {active
                      ? <CheckCircle2 className="h-4 w-4 text-teal shrink-0" aria-hidden />
                      : status === "busy"
                        ? <AlertCircle  className="h-4 w-4 text-danger shrink-0" aria-label="Already booked" />
                        : status === "unavail"
                          ? <Clock        className="h-4 w-4 text-warn   shrink-0" aria-label="Marked unavailable" />
                          : <span className="h-4 w-4 rounded-full bg-success/30 shrink-0" aria-label="Available" />
                    }
                    <span className="flex-1 truncate font-medium">{t.fullName}</span>
                    {status !== "free" && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0
                        ${status === "busy" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>
                        {status === "busy" ? "Busy" : "Unavailable"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Room */}
        <div>
          <label className={labelClass}>Room (optional)</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)}
            className={inputClass} placeholder="e.g. Lab 1, Room 4A" />
        </div>

        {/* Live conflict preview */}
        {previewConflicts && previewConflicts.length > 0 && (
          <div className={`rounded-xl border p-3 space-y-1.5
            ${hasBlocker ? "bg-danger/5 border-danger/25" : "bg-warn-bg border-warn/25"}`}>
            <p className={`text-xs font-semibold flex items-center gap-1.5
              ${hasBlocker ? "text-danger" : "text-warn"}`}>
              {hasBlocker
                ? <><AlertCircle className="h-3.5 w-3.5" /> Conflict detected</>
                : <><AlertTriangle className="h-3.5 w-3.5" /> Warning</>
              }
            </p>
            {previewConflicts.map((c, i) => (
              <p key={i} className="text-xs text-ink/80 leading-relaxed">{c.message}</p>
            ))}
            {!hasBlocker && <p className="text-xs text-slate">You can still save — resolve the warning afterwards.</p>}
          </div>
        )}
        {previewConflicts?.length === 0 && subjectId && teacherId && (
          <div className="flex items-center gap-2 text-xs text-success bg-success-bg border border-success/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> No conflicts detected.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
          <button type="button"
            className={primaryButtonClass}
            disabled={saving || !subjectId || !teacherId || hasBlocker}
            onClick={() => onSave(subjectId, teacherId, room || null)}
          >
            {saving ? "Saving…" : slot ? "Save changes" : "Add lesson"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
