"use client";

/**
 * MarksheetPageClient
 *
 * Client wrapper rendered by the Teacher Mark Sheets server page.
 *
 * Two modes:
 *   Landing (no classId + subjectId in URL):
 *     Shows TeacherMarksheetCards — the period selector + assignment card grid.
 *     Clicking a card pushes classId, subjectId, periodId into the URL which
 *     causes the server to re-render with the actual grid.
 *
 *   Grid (classId + subjectId present in URL):
 *     Shows a "← Back to mark sheets" breadcrumb, then the MarksheetGrid /
 *     CBE grid passed in as {children}.  The period selector is still visible
 *     at the top so the teacher can switch periods without going back.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronDown, TrendingUp } from "lucide-react";
import TeacherMarksheetCards from "@/components/assessment/TeacherMarksheetCards";

// ── Period types (mirrored from server page) ──────────────────────────────────

interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

// ── Small period selector used only in grid mode ──────────────────────────────

function GridPeriodSelector({
  periods,
  currentPeriodId,
  onChange,
}: {
  periods: PeriodOption[];
  currentPeriodId: string;
  onChange: (id: string) => void;
}) {
  function label(p: PeriodOption) {
    return p.term
      ? `Term ${p.term} — ${p.academicYear} (${p.name})`
      : `${p.name} — ${p.academicYear}`;
  }
  const current = periods.find((p) => p.id === currentPeriodId);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/60 px-4 py-3">
      <label className="text-xs font-medium text-slate shrink-0">Exam period</label>
      <div className="relative min-w-[240px]">
        <select
          value={currentPeriodId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-line bg-white pl-3 pr-8 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 transition-colors dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
              {p.isCurrent ? " ✦ Current" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
      </div>
      {current?.isCurrent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal bg-teal/10 rounded-full px-2.5 py-1">
          <TrendingUp className="w-3 h-3" />
          Active period
        </span>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface MarksheetPageClientProps {
  children: React.ReactNode;
  periods: PeriodOption[];
  activePeriodId: string;
  /** Whether the server resolved a specific classId + subjectId (grid mode). */
  isGridMode: boolean;
}

export default function MarksheetPageClient({
  children,
  periods,
  activePeriodId,
  isGridMode,
}: MarksheetPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handlePeriodChange(newPeriodId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodId", newPeriodId);
    router.push(`/teacher/assessments/marksheet?${params.toString()}`);
  }

  // ── Landing mode: period selector + assignment cards ──────────────────────
  if (!isGridMode) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink dark:text-dark-text">
            Mark Sheets
          </h1>
          <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">
            Select an assignment below to open its mark sheet.
          </p>
        </div>
        <TeacherMarksheetCards
          periods={periods}
          initialPeriodId={activePeriodId}
        />
      </div>
    );
  }

  // ── Grid mode: back link + period selector + grid ─────────────────────────
  return (
    <div className="space-y-5">
      {/* Back breadcrumb */}
      <button
        type="button"
        onClick={() => {
          // Strip classId and subjectId, keep periodId so the landing reopens
          // on the same period the teacher was viewing.
          const params = new URLSearchParams();
          if (activePeriodId) params.set("periodId", activePeriodId);
          router.push(`/teacher/assessments/marksheet?${params.toString()}`);
        }}
        className="inline-flex items-center gap-1 text-sm text-teal hover:text-teal/80 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to mark sheets
      </button>

      {/* Period selector (so teacher can switch period from grid view too) */}
      {periods.length > 0 && (
        <GridPeriodSelector
          periods={periods}
          currentPeriodId={activePeriodId}
          onChange={handlePeriodChange}
        />
      )}

      {/* The actual grid (MarksheetGrid / CbeJuniorGrid / CbePathwayGrid) */}
      {children}
    </div>
  );
}
