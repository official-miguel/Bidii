"use client";

/**
 * MarksheetPageClient
 *
 * Client wrapper rendered by the Teacher Mark Sheets server page.
 * Adds:
 *   1. A period selector dropdown at the top (acts as a page-level filter).
 *   2. Summary tiles (total, complete, pending, missing marks) mirroring
 *      the Overview page so teachers have at-a-glance context before entering
 *      the grid.
 *   3. The MarksheetGrid itself (or CBE grids) rendered below.
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import type { TeacherClassCard } from "@/app/api/assessments/home/teacher/route";

// ── Period type ────────────────────────────────────────────────────────────────
interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

interface HomeData {
  cards: TeacherClassCard[];
  currentPeriod: { id: string; name: string } | null;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({
  label,
  value,
  icon,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${accent}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs font-medium mt-0.5 opacity-80 leading-tight">{label}</p>
        {sub && <p className="text-[11px] mt-0.5 opacity-60 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────
function PeriodSelector({
  periods,
  currentPeriodId,
  onChange,
}: {
  periods: PeriodOption[];
  currentPeriodId: string;
  onChange: (id: string) => void;
}) {
  function label(p: PeriodOption) {
    return p.term ? `Term ${p.term} — ${p.academicYear}` : `${p.name} — ${p.academicYear}`;
  }

  const current = periods.find((p) => p.id === currentPeriodId);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate shrink-0">Exam period</label>
      <div className="relative min-w-[220px]">
        <select
          value={currentPeriodId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-line bg-white pl-3 pr-8 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 transition-colors"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
              {p.isCurrent ? " (Current)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
      </div>
      {current?.isCurrent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal bg-teal/10 rounded-full px-2.5 py-1">
          <TrendingUp className="w-3 h-3" />
          Active
        </span>
      )}
    </div>
  );
}

// ── Summary tiles strip ───────────────────────────────────────────────────────
function SummaryTiles({ cards }: { cards: TeacherClassCard[] }) {
  const total = cards.length;
  const complete = cards.filter(
    (c) => c.totalStudents > 0 && c.enteredCount >= c.totalStudents
  ).length;
  const pending = total - complete;
  const totalMissing = cards.reduce(
    (sum, c) => sum + Math.max(0, c.totalStudents - c.enteredCount),
    0
  );
  const totalStudents = cards.reduce((sum, c) => sum + c.totalStudents, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile
        label="Total assignments"
        value={total}
        icon={<BookOpen className="w-4.5 h-4.5 text-royal" />}
        accent="bg-blue-50 border-blue-200 text-blue-900"
        sub={`${total} class–subject pair${total !== 1 ? "s" : ""}`}
      />
      <StatTile
        label="Complete"
        value={complete}
        icon={<CheckCircle2 className="w-4.5 h-4.5 text-green-600" />}
        accent="bg-green-50 border-green-200 text-green-900"
        sub={total > 0 ? `${Math.round((complete / total) * 100)}% done` : "—"}
      />
      <StatTile
        label="Pending"
        value={pending}
        icon={<Clock className="w-4.5 h-4.5 text-amber-600" />}
        accent={
          pending > 0
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-paper border-line text-slate"
        }
        sub={pending > 0 ? "need mark entry" : "All done!"}
      />
      <StatTile
        label="Missing marks"
        value={totalMissing}
        icon={<AlertCircle className="w-4.5 h-4.5 text-danger" />}
        accent={
          totalMissing > 0
            ? "bg-red-50 border-red-200 text-red-900"
            : "bg-paper border-line text-slate"
        }
        sub={`across ${totalStudents} enrolled`}
      />
    </div>
  );
}

// ── Main wrapper ──────────────────────────────────────────────────────────────
interface MarksheetPageClientProps {
  children: React.ReactNode;
  /** Periods available for this framework. */
  periods: PeriodOption[];
  /** The period currently in effect (from searchParam or isCurrent). */
  activePeriodId: string;
}

export default function MarksheetPageClient({
  children,
  periods,
  activePeriodId,
}: MarksheetPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);

  // Load assignment summary for tiles
  useEffect(() => {
    setHomeLoading(true);
    fetch("/api/assessments/home/teacher")
      .then((r) => r.json())
      .then((d: HomeData) => { setHomeData(d); setHomeLoading(false); })
      .catch(() => setHomeLoading(false));
  }, []);

  function handlePeriodChange(newPeriodId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodId", newPeriodId);
    router.push(`/teacher/assessments/marksheet?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      {/* ── Period selector ── */}
      {periods.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/60 px-4 py-3">
          <PeriodSelector
            periods={periods}
            currentPeriodId={activePeriodId}
            onChange={handlePeriodChange}
          />
        </div>
      )}

      {/* ── Summary tiles ── */}
      {homeLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-line/40 animate-pulse" />
          ))}
        </div>
      ) : homeData && homeData.cards.length > 0 ? (
        <SummaryTiles cards={homeData.cards} />
      ) : null}

      {/* ── Grid and rest of page ── */}
      {children}
    </div>
  );
}
