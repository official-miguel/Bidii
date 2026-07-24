"use client";

/**
 * /principal/timetable — Enterprise Timetable Dashboard
 *
 * The root shell for the timetable module. Displays a live summary of the
 * currently published timetable, quick stats, and navigation into the four
 * sub-sections (Builder, Generate, Versions, Settings).
 *
 * All data is loaded client-side so the shell renders instantly from the
 * offline store while network requests complete in the background.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays, Layers, Settings2, Sparkles, CheckCircle2,
  AlertTriangle, ArrowRight,
  TrendingUp, RefreshCw, ChevronRight, Zap, BookOpen,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import { PageHeader, ErrorBanner } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

type Version = {
  id: string; name: string; status: string;
  slotCount: number; createdAt: string; publishedAt: string | null;
  academicYear: string | null; term: number | null;
};

type TimetableSummary = {
  publishedVersion: Version | null;
  draftCount: number;
  totalSlots: number;
  classCount: number;
  teacherCount: number;
  warnings: string[];
};

// ── Context nav items ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/principal/timetable",          label: "Overview",  exact: true },
  { href: "/principal/timetable/builder",  label: "Builder"  },
  { href: "/principal/timetable/generate", label: "Generate" },
  { href: "/principal/timetable/versions", label: "Versions" },
  { href: "/principal/timetable/settings", label: "Settings" },
];

// ── Day labels ─────────────────────────────────────────────────────────────
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Component ──────────────────────────────────────────────────────────────

export default function TimetableDashboardPage() {
  const [summary, setSummary]   = useState<TimetableSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Quick slot distribution by day (for mini heatmap)
  const [dayDist, setDayDist] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [versionsRes] = await Promise.all([
        fetch("/api/timetable/v2/versions"),
        fetch("/api/timetable?schoolWide=1").catch(() => null),
      ]);

      if (!versionsRes.ok) throw new Error("Failed to load timetable data.");

      const versions: Version[] = await versionsRes.json();
      const published = versions.find((v) => v.status === "PUBLISHED") ?? null;
      const drafts    = versions.filter((v) => v.status === "DRAFT");

      // Slot distribution by day from the published version
      let dayDistArr = [0, 0, 0, 0, 0];
      if (published) {
        const slotsRes2 = await fetch(`/api/timetable/v2/versions/${published.id}/slots`);
        if (slotsRes2.ok) {
          const slots: Array<{ dayOfWeek: number }> = await slotsRes2.json();
          dayDistArr = [0, 0, 0, 0, 0, 0, 0];
          for (const s of slots) {
            if (s.dayOfWeek >= 0 && s.dayOfWeek <= 6)
              dayDistArr[s.dayOfWeek] = (dayDistArr[s.dayOfWeek] ?? 0) + 1;
          }
        }
      }
      setDayDist(dayDistArr);

      setSummary({
        publishedVersion: published,
        draftCount: drafts.length,
        totalSlots: published?.slotCount ?? 0,
        classCount: 0,   // resolved lazily
        teacherCount: 0, // resolved lazily
        warnings: [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const published = summary?.publishedVersion;

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Timetable"
        description="Manage the school schedule — build, generate, version, and publish."
      />

      <div className="space-y-6">
        {error && <ErrorBanner message={error} />}

        {/* ── Status banner ──────────────────────────────────────────────── */}
        {!loading && (
          <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4
            ${published
              ? "bg-success-bg border-success/20"
              : "bg-warn-bg border-warn/20"
            }`}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {published
                ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                : <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
              }
              <div className="min-w-0">
                {published ? (
                  <>
                    <p className="text-sm font-semibold text-ink">
                      Published — {published.name}
                    </p>
                    <p className="text-xs text-slate mt-0.5">
                      {published.slotCount} lessons scheduled
                      {published.academicYear ? ` · ${published.academicYear}` : ""}
                      {published.term         ? ` Term ${published.term}` : ""}
                      {published.publishedAt  ? ` · Published ${new Date(published.publishedAt).toLocaleDateString()}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink">No timetable published</p>
                    <p className="text-xs text-slate mt-0.5">
                      Generate or build a timetable, then publish it so teachers and students can see it.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {published ? (
                <Link
                  href="/principal/timetable/builder"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium
                             bg-white border border-line text-ink hover:border-teal hover:text-teal transition-colors"
                >
                  Edit <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <Link
                  href="/principal/timetable/generate"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium
                             bg-teal text-white hover:bg-teal-dark transition-colors shadow-xs"
                >
                  <Zap className="h-3 w-3" /> Generate now
                </Link>
              )}
              <button
                onClick={load}
                className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-line rounded-xl p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Total lessons" value={summary?.totalSlots ?? 0} color="teal" />
            <StatCard icon={<Layers       className="h-5 w-5" />} label="Draft versions" value={summary?.draftCount ?? 0} color="slate" />
            <StatCard icon={<BookOpen     className="h-5 w-5" />} label="Status"
              value={published ? "Published" : "Draft"} valueClass={published ? "text-success" : "text-warn"} color="slate" />
            <StatCard icon={<TrendingUp   className="h-5 w-5" />} label="Versions total"
              value={summary ? (summary.draftCount + (published ? 1 : 0)) : 0} color="slate" />
          </div>
        )}

        {/* ── Lesson distribution mini-heatmap ──────────────────────────── */}
        {published && dayDist.length > 0 && (
          <div className="bg-white border border-line rounded-xl p-5">
            <p className="text-sm font-semibold text-ink mb-4">Lessons per day</p>
            <div className="flex items-end gap-3">
              {dayDist.map((count, i) => {
                if (count === 0 && i >= 5) return null;
                const maxCount = Math.max(...dayDist, 1);
                const heightPct = Math.max(8, Math.round((count / maxCount) * 100));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-slate">{count}</span>
                    <div
                      className="w-full rounded-md bg-teal/80 transition-all duration-300"
                      style={{ height: `${heightPct}px` }}
                    />
                    <span className="text-[10px] text-slate uppercase tracking-wide">{DAY_LABELS[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quick-access cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard
            href="/principal/timetable/builder"
            icon={<CalendarDays className="h-6 w-6" />}
            title="Builder"
            description="View, edit, and fine-tune the live timetable grid by class or by teacher."
            accent="teal"
          />
          <NavCard
            href="/principal/timetable/generate"
            icon={<Sparkles className="h-6 w-6" />}
            title="Generate"
            description="Run the constraint solver to auto-schedule classes, then preview and apply."
            accent="purple"
          />
          <NavCard
            href="/principal/timetable/versions"
            icon={<Layers className="h-6 w-6" />}
            title="Versions"
            description="Manage draft and archived versions, clone between terms, roll back."
            accent="blue"
          />
          <NavCard
            href="/principal/timetable/settings"
            icon={<Settings2 className="h-6 w-6" />}
            title="Settings"
            description="Configure operating days, periods, special slots, and workload rules."
            accent="amber"
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color = "teal", valueClass = "",
}: {
  icon: React.ReactNode; label: string; value: string | number;
  color?: string; valueClass?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-xl p-5 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
        ${color === "teal" ? "bg-teal/10 text-teal" : "bg-paper text-slate"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none mt-0.5 ${valueClass || "text-ink"}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        <p className="text-xs text-slate mt-1 leading-snug">{label}</p>
      </div>
    </div>
  );
}

function NavCard({
  href, icon, title, description, accent,
}: {
  href: string; icon: React.ReactNode; title: string;
  description: string; accent: string;
}) {
  const accentMap: Record<string, string> = {
    teal:   "bg-teal/8 text-teal group-hover:bg-teal/15",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
    blue:   "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    amber:  "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
  };
  return (
    <Link
      href={href}
      className="group bg-white border border-line rounded-xl p-5 flex flex-col gap-3
                 hover:border-teal/40 hover:shadow-sm transition-all duration-150"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${accentMap[accent] ?? accentMap.teal}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors flex items-center gap-1">
          {title} <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </p>
        <p className="text-xs text-slate mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
