"use client";

/**
 * MarksheetPageClient
 *
 * Client wrapper rendered by the Teacher Mark Sheets server page.
 *
 * Two modes:
 *   Landing (no classId + subjectId in URL):
 *     Shows TeacherMarksheetCards — the period selector + assignment card grid.
 *
 *   Grid (classId + subjectId present in URL):
 *     Shows a "← Back to mark sheets" breadcrumb, then the MarksheetGrid /
 *     CBE grid passed in as {children}. No period selector here — the teacher
 *     picks the period on the landing screen before opening a card.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import TeacherMarksheetCards from "@/components/assessment/TeacherMarksheetCards";

interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

interface MarksheetPageClientProps {
  children: React.ReactNode;
  periods: PeriodOption[];
  activePeriodId: string;
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

  // ── Grid mode: back link + grid only (no period selector) ─────────────────
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => {
          // Strip classId and subjectId; keep periodId so the landing reopens
          // on the same period the teacher was viewing.
          const params = new URLSearchParams(searchParams.toString());
          params.delete("classId");
          params.delete("subjectId");
          router.push(`/teacher/assessments/marksheet?${params.toString()}`);
        }}
        className="inline-flex items-center gap-1 text-sm text-teal hover:text-teal/80 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to mark sheets
      </button>

      {children}
    </div>
  );
}
