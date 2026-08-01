"use client";

/**
 * TimetableGrid — renders a school timetable in the format described in the spec:
 *
 *   • Columns across the top = template columns (time range headers)
 *     Each column is either a LESSON slot or a non-lesson period (BREAK / LUNCH /
 *     GAMES / ASSEMBLY). Non-lesson columns span every day row as a shaded cell
 *     with the period label.
 *
 *   • Rows down the left = operating days (Monday … Friday, etc.)
 *
 *   • Each lesson cell shows: subject code (large), teacher name (small),
 *     room if set, and a colour derived from the subject's internalCode.
 *
 *   • Empty lesson cells show a faint dashed border so admins can see
 *     which slots are unfilled.
 *
 * The component is purely presentational — it receives data and callbacks,
 * does no fetching itself.
 */

import { useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type GridColumn = {
  position:  number;
  startTime: string;   // "HH:MM"
  endTime:   string;   // "HH:MM"
  slotType:  "LESSON" | "BREAK" | "LUNCH" | "GAMES" | "ASSEMBLY";
  label:     string | null;
  session:   "MORNING" | "AFTERNOON" | "EVENING";
};

export type GridSlot = {
  dayOfWeek:   number;
  /** 1-based period index among LESSON columns only */
  period:      number;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  room:        string | null;
  internalCode?: number;
  isLocked?:   boolean;
  isManual?:   boolean;
  /** If true, this slot represents a group of subjects */
  isGroupAnchor?: boolean;
  /** Group members (other subjects in the same group) */
  groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
  /** All teachers involved in this group slot */
  allTeachers?: string[];
};

export type TimetableGridProps = {
  /** Template columns defining the school day (from GET /api/timetable/template) */
  columns:      GridColumn[];
  /** Active operating days e.g. [0,1,2,3,4] */
  operatingDays: number[];
  /** All slots to display */
  slots:        GridSlot[];
  /** Called when user clicks a lesson cell (add / edit) */
  onCellClick?: (day: number, period: number, slot: GridSlot | null) => void;
  /** If true, cells are not interactive */
  readOnly?:    boolean;
  /** Highlight a specific (day, period) pair */
  highlightCell?: { day: number; period: number } | null;
  /** Show time labels in the column headers */
  showTimes?:   boolean;
};

// ── Colours ────────────────────────────────────────────────────────────────

const SUBJECT_PALETTES = [
  { bg: "bg-teal-50",    border: "border-teal-200",   text: "text-teal-800",    sub: "text-teal-600"   },
  { bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-800",    sub: "text-blue-600"   },
  { bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-800",  sub: "text-purple-600" },
  { bg: "bg-emerald-50", border: "border-emerald-200",text: "text-emerald-800", sub: "text-emerald-600"},
  { bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-800",   sub: "text-amber-600"  },
  { bg: "bg-rose-50",    border: "border-rose-200",   text: "text-rose-800",    sub: "text-rose-600"   },
  { bg: "bg-cyan-50",    border: "border-cyan-200",   text: "text-cyan-800",    sub: "text-cyan-600"   },
  { bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-800",  sub: "text-orange-600" },
  { bg: "bg-lime-50",    border: "border-lime-200",   text: "text-lime-800",    sub: "text-lime-600"   },
  { bg: "bg-indigo-50",  border: "border-indigo-200", text: "text-indigo-800",  sub: "text-indigo-600" },
  { bg: "bg-pink-50",    border: "border-pink-200",   text: "text-pink-800",    sub: "text-pink-600"   },
  { bg: "bg-sky-50",     border: "border-sky-200",    text: "text-sky-800",     sub: "text-sky-600"    },
];

const NON_LESSON_STYLES: Record<string, string> = {
  BREAK:    "bg-orange-50 border-orange-100 text-orange-600",
  LUNCH:    "bg-green-50  border-green-100  text-green-700",
  GAMES:    "bg-pink-50   border-pink-100   text-pink-700",
  ASSEMBLY: "bg-slate-100 border-slate-200  text-slate-600",
};

const colorCache = new Map<string, (typeof SUBJECT_PALETTES)[0]>();
let colorCounter = 0;

function colorForSubject(subjectCode: string, internalCode?: number): (typeof SUBJECT_PALETTES)[0] {
  const key = internalCode != null ? `ic:${internalCode}` : subjectCode;
  if (!colorCache.has(key)) {
    colorCache.set(key, SUBJECT_PALETTES[colorCounter++ % SUBJECT_PALETTES.length]);
  }
  return colorCache.get(key)!;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Component ──────────────────────────────────────────────────────────────

export default function TimetableGrid({
  columns,
  operatingDays,
  slots,
  onCellClick,
  readOnly = false,
  highlightCell,
  showTimes = true,
}: TimetableGridProps) {
  // Separate lesson and non-lesson columns, preserving their original positions
  const { lessonCols, allCols } = useMemo(() => {
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const lesson = sorted.filter((c) => c.slotType === "LESSON");
    return { lessonCols: lesson, allCols: sorted };
  }, [columns]);

  // Build slot lookup: "day-period" → GridSlot
  const slotMap = useMemo(() => {
    const m = new Map<string, GridSlot>();
    for (const s of slots) m.set(`${s.dayOfWeek}-${s.period}`, s);
    return m;
  }, [slots]);

  // Map lesson column position → 1-based period number
  const periodByPosition = useMemo(() => {
    const m = new Map<number, number>();
    lessonCols.forEach((c, i) => m.set(c.position, i + 1));
    return m;
  }, [lessonCols]);

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-center">
        <p className="text-sm text-slate">No template configured.</p>
        <p className="text-xs text-slate/60 mt-1">
          Visit <strong>Day Template</strong> to set up the school-day format first.
        </p>
      </div>
    );
  }

  if (operatingDays.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-center">
        <p className="text-sm text-slate">No operating days configured.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="min-w-full border-collapse text-xs">

        {/* ── Column headers ──────────────────────────────────────── */}
        <thead>
          <tr className="bg-paper border-b border-line">
            {/* Day label corner */}
            <th className="sticky left-0 z-20 bg-paper px-3 py-2.5 text-left border-r border-line min-w-[72px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Day</span>
            </th>

            {allCols.map((col) => {
              const isLesson = col.slotType === "LESSON";
              const period   = periodByPosition.get(col.position);
              const nlStyle  = NON_LESSON_STYLES[col.slotType] ?? "bg-slate-50 border-slate-200 text-slate-500";

              return (
                <th key={col.position}
                  className={`px-1.5 py-2 min-w-[82px] max-w-[110px] border-r border-line last:border-r-0 font-normal
                    ${isLesson ? "bg-paper" : nlStyle}`}>
                  {isLesson ? (
                    <div className="text-center space-y-0.5">
                      <p className="text-[10px] font-semibold text-slate uppercase tracking-wide">
                        P{period}
                      </p>
                      {showTimes && (
                        <p className="text-[9px] text-slate/70 font-normal">
                          {col.startTime}–{col.endTime}
                        </p>
                      )}
                      <SessionPip session={col.session} />
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-[10px] font-medium">{col.label ?? col.slotType}</p>
                      {showTimes && (
                        <p className="text-[9px] opacity-70">{col.startTime}–{col.endTime}</p>
                      )}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ── Day rows ────────────────────────────────────────────── */}
        <tbody>
          {operatingDays.map((day, rowIdx) => (
            <tr key={day} className={rowIdx % 2 === 0 ? "bg-white" : "bg-paper/40"}>

              {/* Day label */}
              <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 border-r border-b border-line font-medium whitespace-nowrap">
                <span className="hidden sm:inline text-slate">{DAY_NAMES[day]}</span>
                <span className="sm:hidden text-slate">{DAY_SHORT[day]}</span>
              </td>

              {/* Cells */}
              {allCols.map((col) => {
                const isLesson = col.slotType === "LESSON";
                const period   = isLesson ? periodByPosition.get(col.position) : null;

                if (!isLesson) {
                  // Non-lesson: shaded span across the row
                  const nlStyle = NON_LESSON_STYLES[col.slotType] ?? "bg-slate-50";
                  return (
                    <td key={col.position}
                      className={`border-r border-b border-line last:border-r-0 px-1 py-1.5 text-center ${nlStyle}`}>
                      <span className="text-[9px] font-medium opacity-70">{col.label ?? col.slotType}</span>
                    </td>
                  );
                }

                const slot   = period != null ? slotMap.get(`${day}-${period}`) ?? null : null;
                const isHigh = highlightCell?.day === day && highlightCell?.period === period;

                return (
                  <td key={col.position}
                    className={`border-r border-b border-line last:border-r-0 p-0.5 align-top
                      ${isHigh ? "ring-2 ring-teal ring-inset" : ""}`}>
                    <LessonCell
                      slot={slot}
                      day={day}
                      period={period ?? 0}
                      readOnly={readOnly}
                      onClick={onCellClick}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── LessonCell ─────────────────────────────────────────────────────────────

function LessonCell({
  slot, day, period, readOnly, onClick,
}: {
  slot:     GridSlot | null;
  day:      number;
  period:   number;
  readOnly: boolean;
  onClick?: (day: number, period: number, slot: GridSlot | null) => void;
}) {
  const palette = slot ? colorForSubject(slot.subjectCode, slot.internalCode) : null;
  const interactive = !readOnly && !!onClick;

  if (!slot) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onClick?.(day, period, null)}
        aria-label={`Add lesson — ${DAY_SHORT[day]} period ${period}`}
        className={`w-full min-h-[52px] rounded border border-dashed border-line/60 flex items-center justify-center
          ${interactive ? "hover:border-teal/50 hover:bg-teal/4 transition-colors cursor-pointer" : "cursor-default"}`}
      >
        {interactive && (
          <span className="text-[10px] text-slate/40 group-hover:text-teal">+</span>
        )}
      </button>
    );
  }

  // For group slots, show abbreviated info or full group details
  const isGroup = slot.isGroupAnchor && slot.groupMembers && slot.groupMembers.length > 0;
  const memberCount = isGroup ? slot.groupMembers!.length + 1 : 0; // +1 for anchor

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onClick?.(day, period, slot)}
      aria-label={`${slot.subjectCode}${isGroup ? ` (group, ${memberCount} subjects)` : ""} — ${slot.teacherName}, period ${period}`}
      className={`w-full min-h-[52px] rounded border px-1.5 py-1.5 text-left flex flex-col justify-between
        ${palette!.bg} ${palette!.border}
        ${interactive ? "hover:brightness-95 transition-all cursor-pointer active:scale-[0.98]" : "cursor-default"}
        ${slot.isLocked ? "opacity-80 ring-1 ring-inset ring-slate-400/30" : ""}
        ${isGroup ? "ring-2 ring-inset ring-teal/40 bg-opacity-80" : ""}
      `}
      title={isGroup ? `Group: ${[slot.subjectCode, ...slot.groupMembers!.map(m => m.subjectCode)].join(", ")}` : undefined}
    >
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-bold leading-tight truncate block ${palette!.text}`}>
            {slot.subjectCode}
            {isGroup && <span className="text-[9px] ml-0.5">+{slot.groupMembers!.length}</span>}
          </span>
          {isGroup && slot.groupMembers && slot.groupMembers.length > 0 && (
            <p className={`text-[8px] truncate leading-tight mt-0.5 ${palette!.sub} opacity-70`}>
              {slot.groupMembers.map(m => m.subjectCode).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 shrink-0">
          {isGroup && (
            <span className="text-[8px] bg-teal/20 text-teal px-1 rounded font-semibold leading-tight">🔀</span>
          )}
          {slot.isLocked && (
            <span className="text-[8px] bg-slate-200 text-slate-600 px-1 rounded font-semibold leading-tight">🔒</span>
          )}
          {slot.isManual && (
            <span className="text-[8px] bg-teal/20 text-teal px-1 rounded font-semibold leading-tight">M</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] truncate leading-tight ${palette!.sub}`}>
          {isGroup && slot.allTeachers ? slot.allTeachers.join(", ") : slot.teacherName}
        </p>
        {slot.room && (
          <p className={`text-[9px] truncate leading-tight mt-0.5 ${palette!.sub} opacity-80`}>{slot.room}</p>
        )}
      </div>
    </button>
  );
}

// ── Session pip ────────────────────────────────────────────────────────────

function SessionPip({ session }: { session: "MORNING" | "AFTERNOON" | "EVENING" }) {
  const styles = {
    MORNING:   "bg-amber-300",
    AFTERNOON: "bg-blue-300",
    EVENING:   "bg-purple-300",
  };
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mx-auto ${styles[session]}`}
      title={session.charAt(0) + session.slice(1).toLowerCase()}
    />
  );
}
