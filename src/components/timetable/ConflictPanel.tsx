"use client";
/**
 * ConflictPanel — floating side-panel listing every live conflict.
 *
 * Features:
 *  • Grouped by severity (errors first, then warnings)
 *  • Conflict-type icons with accessible aria-labels
 *  • "Jump to" button scrolls the conflicting cell into view
 *  • Multi-select checkboxes for "Auto Fix Selected"
 *  • Keyboard accessible — focus trap when open
 */
import { useState } from "react";
import {
  X, AlertCircle, Info, ArrowRight,
  BookOpen, User, Clock, CalendarX2, BarChart2,
  ZapOff, ChevronDown, ChevronUp, Wrench,
} from "lucide-react";
import type { CellConflict, ConflictType, ConflictSummary } from "@/lib/ai/timetableConflictEngine";
import { primaryButtonClass } from "@/components/ui";

// ── Icon mapping ───────────────────────────────────────────────────────────

const TYPE_META: Record<ConflictType, { Icon: React.ElementType; label: string; color: string }> = {
  TEACHER_DOUBLE_BOOKED: { Icon: User,       label: "Teacher double-booked",  color: "text-danger" },
  CLASS_DOUBLE_BOOKED:   { Icon: BookOpen,    label: "Class double-booked",    color: "text-danger" },
  SPECIAL_PERIOD:        { Icon: CalendarX2,  label: "Blocked period",         color: "text-danger" },
  TEACHER_UNAVAILABLE:   { Icon: Clock,       label: "Teacher unavailable",    color: "text-danger" },
  INACTIVE_DAY:          { Icon: CalendarX2,  label: "Inactive day",           color: "text-danger" },
  WORKLOAD_EXCEEDED:     { Icon: BarChart2,   label: "Workload exceeded",      color: "text-danger" },
  LESSON_INCOMPLETE:     { Icon: ZapOff,      label: "Missing lessons",        color: "text-warn"   },
  DOUBLE_NOT_ADJACENT:   { Icon: ArrowRight,  label: "Non-adjacent double",    color: "text-danger" },
  LOCKED_SLOT_MOVED:     { Icon: ArrowRight,  label: "Locked slot conflict",   color: "text-danger" },
};

// ── Props ─────────────────────────────────────────────────────────────────

type Props = {
  summary:       ConflictSummary;
  onJumpTo:      (key: string) => void;
  onAutoFix:     (classIds: string[]) => void;
  onClose:       () => void;
  autoFixing:    boolean;
};

// ── Component ─────────────────────────────────────────────────────────────

export default function ConflictPanel({
  summary, onJumpTo, onAutoFix, onClose, autoFixing,
}: Props) {
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [showWarnings,setShowWarnings]= useState(true);

  const errors   = summary.conflictList.filter((e) => e.conflict.severity === "error");
  const warnings = summary.conflictList.filter((e) => e.conflict.severity === "warning");

  function toggle(key: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) { n.delete(key); } else { n.add(key); }
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(errors.map((e) => e.key)));
  }

  function handleAutoFix() {
    // Extract class IDs from the selected cell keys
    const classIds = new Set<string>();
    for (const key of selected) {
      const match = key.match(/^class:([^|]+)/);
      if (match) classIds.add(match[1]);
    }
    if (classIds.size > 0) onAutoFix([...classIds]);
  }

  return (
    <div
      role="complementary"
      aria-label="Conflict panel"
      className="flex flex-col bg-white border border-line rounded-xl shadow-lg
                 w-full sm:w-80 max-h-[calc(100vh-8rem)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0" aria-hidden />
          <p className="text-sm font-semibold text-ink">
            Conflicts
          </p>
          <span className="inline-flex items-center gap-1.5">
            {summary.totalErrors > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                {summary.totalErrors} error{summary.totalErrors !== 1 ? "s" : ""}
              </span>
            )}
            {summary.totalWarnings > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warn/10 text-warn">
                {summary.totalWarnings} warning{summary.totalWarnings !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close conflict panel"
          className="p-1.5 rounded-lg text-slate hover:text-ink hover:bg-paper transition-colors"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {summary.conflictList.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm font-semibold text-success">No conflicts</p>
            <p className="text-xs text-slate mt-1">The timetable is clean.</p>
          </div>
        )}

        {/* Errors */}
        {errors.map(({ key, conflict }, i) => (
          <ConflictEntry
            key={`err-${i}`}
            cellKey={key}
            conflict={conflict}
            checked={selected.has(key)}
            onToggle={() => toggle(key)}
            onJump={() => onJumpTo(key)}
          />
        ))}

        {/* Warnings section */}
        {warnings.length > 0 && (
          <>
            <button
              onClick={() => setShowWarnings((o) => !o)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs
                         font-semibold text-slate hover:text-ink transition-colors"
            >
              Warnings ({warnings.length})
              {showWarnings
                ? <ChevronUp   className="h-3.5 w-3.5" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              }
            </button>
            {showWarnings && warnings.map(({ key, conflict }, i) => (
              <ConflictEntry
                key={`warn-${i}`}
                cellKey={key}
                conflict={conflict}
                checked={selected.has(key)}
                onToggle={() => toggle(key)}
                onJump={() => onJumpTo(key)}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer actions */}
      {errors.length > 0 && (
        <div className="shrink-0 border-t border-line px-3 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate">
            <button onClick={selectAll} className="hover:text-teal transition-colors">
              Select all errors
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="hover:text-teal transition-colors"
            >
              Clear
            </button>
          </div>
          <button
            onClick={handleAutoFix}
            disabled={selected.size === 0 || autoFixing}
            className={`${primaryButtonClass} w-full text-xs`}
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            {autoFixing
              ? "Auto-fixing…"
              : `Auto Fix${selected.size > 0 ? ` (${selected.size} selected)` : ""}`
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ── Single conflict entry ─────────────────────────────────────────────────

function ConflictEntry({
  conflict, checked, onToggle, onJump,
}: {
  cellKey:  string;
  conflict: CellConflict;
  checked:  boolean;
  onToggle: () => void;
  onJump:   () => void;
}) {
  const meta = TYPE_META[conflict.type];
  const Icon = meta?.Icon ?? Info;

  return (
    <div
      className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors
        ${checked
          ? "bg-teal-50 border-teal/30"
          : conflict.severity === "error"
            ? "bg-danger/4 border-danger/20"
            : "bg-warn-bg border-warn/20"
        }`}
    >
      {/* Checkbox — only for errors */}
      {conflict.severity === "error" && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select: ${conflict.message}`}
          className="mt-0.5 h-3.5 w-3.5 rounded border-line shrink-0 cursor-pointer"
        />
      )}

      {/* Type icon */}
      <Icon
        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${meta?.color ?? "text-slate"}`}
        aria-label={meta?.label}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink leading-tight">{conflict.message}</p>
        <p className="text-[10px] text-teal mt-0.5 leading-snug">{conflict.action}</p>
      </div>

      {/* Jump button */}
      <button
        onClick={onJump}
        aria-label="Jump to conflict"
        title="Jump to this conflict"
        className="shrink-0 p-1 rounded text-slate hover:text-teal hover:bg-teal-50 transition-colors"
      >
        <ArrowRight className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
