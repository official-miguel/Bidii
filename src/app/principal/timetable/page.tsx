"use client";

/**
 * /principal/timetable — Timetable Hub
 *
 * Shows published-timetable status, a guided setup checklist for first-time
 * configuration, quick-access cards for every section, and a per-day
 * lesson distribution bar when a timetable is published.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays, CheckCircle2, AlertTriangle, RefreshCw,
  ChevronRight, Zap, Layers, BookOpen,
  Clock, Sun, BarChart2, Wrench, ArrowRight,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import { PageHeader, ErrorBanner } from "@/components/ui";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";

// ── Types ──────────────────────────────────────────────────────────────────
type Version = {
  id: string; name: string; status: string; slotCount: number;
  createdAt: string; publishedAt: string | null;
  academicYear: string | null; term: number | null;
};

type TemplateStatus = { hasTemplate: boolean; lessonSlots: number; operatingDays: number };
type SetupStatus = {
  hasTemplate: boolean;
  hasRequirements: boolean;
  hasTeacherAssignments: boolean;
  hasPublished: boolean;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Component ──────────────────────────────────────────────────────────────
export default function TimetableDashboardPage() {
  const [published,    setPublished]    = useState<Version | null>(null);
  const [draftCount,   setDraftCount]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [dayDist,      setDayDist]      = useState<number[]>([]);
  const [templateInfo, setTemplateInfo] = useState<TemplateStatus | null>(null);
  const [setup,        setSetup]        = useState<SetupStatus>({
    hasTemplate: false, hasRequirements: false,
    hasTeacherAssignments: false, hasPublished: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [versionsRes, templateRes] = await Promise.all([
        fetch("/api/timetable/v2/versions"),
        fetch("/api/timetable/template"),
      ]);

      if (!versionsRes.ok) throw new Error("Failed to load timetable data.");
      const versions: Version[] = await versionsRes.json();
      const pub = versions.find((v) => v.status === "PUBLISHED") ?? null;
      setPublished(pub);
      setDraftCount(versions.filter((v) => v.status === "DRAFT").length);

      // Fetch template metadata
      let tplStatus: TemplateStatus = { hasTemplate: false, lessonSlots: 0, operatingDays: 0 };
      if (templateRes.ok) {
        const tpl = await templateRes.json();
        const lessonSlots = (tpl.config?.columns ?? []).filter((c: any) => c.slotType === "LESSON").length;
        const operatingDays = (tpl.config?.operatingDays ?? []).length;
        tplStatus = { hasTemplate: lessonSlots > 0, lessonSlots, operatingDays };
      }
      setTemplateInfo(tplStatus);

      // Lesson-per-day distribution from published version
      if (pub) {
        const slotsRes = await fetch(`/api/timetable/v2/versions/${pub.id}/slots`);
        if (slotsRes.ok) {
          const slots: Array<{ dayOfWeek: number }> = await slotsRes.json();
          const dist = [0, 0, 0, 0, 0, 0, 0];
          for (const s of slots) {
            if (s.dayOfWeek >= 0 && s.dayOfWeek <= 6) dist[s.dayOfWeek]++;
          }
          setDayDist(dist);
        }
      }

      // Setup checklist
      setSetup({
        hasTemplate: tplStatus.hasTemplate,
        hasRequirements: false, // resolved lazily below
        hasTeacherAssignments: false,
        hasPublished: !!pub,
      });

      // Check requirements exist
      const reqRes = await fetch("/api/timetable/lesson-requirements");
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        const hasReqs = (reqData.requirements ?? []).length > 0;
        // Check assignments via pre-check
        const preRes = await fetch("/api/timetable/v2/pre-check", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        let hasAssign = false;
        if (preRes.ok) {
          const preData = await preRes.json();
          hasAssign = preData.issues?.filter((i: any) => i.type === "MISSING_TEACHER_ASSIGNMENT").length === 0;
        }
        setSetup({ hasTemplate: tplStatus.hasTemplate, hasRequirements: hasReqs, hasTeacherAssignments: hasAssign, hasPublished: !!pub });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setupSteps = [
    { done: setup.hasTemplate,          href: "/principal/timetable/template",     label: "Set up the day template",             sub: "Define time slots, breaks, and sessions" },
    { done: setup.hasRequirements,      href: "/principal/timetable/requirements",  label: "Set lesson requirements per class",   sub: "How many lessons each class needs per subject" },
    { done: setup.hasTeacherAssignments,href: "/principal/subjects",               label: "Assign teachers to subjects",         sub: "Each class-subject pair needs a teacher" },
    { done: setup.hasPublished,         href: "/principal/timetable/generate",      label: "Generate and publish a timetable",    sub: "Run the constraint solver and publish" },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const allSetup  = setupDone === setupSteps.length;

  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <PageHeader
        title="Timetable"
        description="Configure, generate, and manage the school schedule."
      />

      <div className="space-y-6">
        {error && <ErrorBanner message={error} />}

        {/* ── Published status banner ───────────────────────────────── */}
        {!loading && (
          <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4
            ${published ? "bg-success-bg border-success/20" : "bg-warn-bg border-warn/20"}`}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {published
                ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                : <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />}
              <div className="min-w-0">
                {published ? (
                  <>
                    <p className="text-sm font-semibold text-ink">Live — {published.name}</p>
                    <p className="text-xs text-slate mt-0.5">
                      {published.slotCount} lessons
                      {published.academicYear ? ` · ${published.academicYear}` : ""}
                      {published.term ? ` Term ${published.term}` : ""}
                      {published.publishedAt ? ` · Published ${new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink">No timetable published</p>
                    <p className="text-xs text-slate mt-0.5">
                      Complete setup below, then generate and publish so teachers can see their schedules.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {published
                ? <Link href="/principal/timetable/builder"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white border border-line text-ink hover:border-teal hover:text-teal transition-colors">
                    Edit <ArrowRight className="h-3 w-3" />
                  </Link>
                : <Link href="/principal/timetable/generate"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-teal text-white hover:bg-teal-dark transition-colors">
                    <Zap className="h-3 w-3" /> Generate now
                  </Link>}
              <button onClick={load} title="Refresh"
                className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        )}

        {/* ── Setup checklist (always visible until all done) ───────── */}
        {!allSetup && !loading && (
          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">Setup checklist</h2>
                <p className="text-xs text-slate mt-0.5">{setupDone} of {setupSteps.length} steps complete</p>
              </div>
              <div className="w-24 bg-line rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-teal rounded-full transition-all duration-500"
                  style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
              </div>
            </div>
            <div className="divide-y divide-line">
              {setupSteps.map((step, i) => (
                <Link key={i} href={step.href}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-paper transition-colors group">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                    ${step.done ? "bg-success text-white" : "bg-line text-slate"}`}>
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.done ? "text-slate line-through" : "text-ink"}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-slate mt-0.5">{step.sub}</p>
                  </div>
                  {!step.done && (
                    <ChevronRight className="h-4 w-4 text-slate group-hover:text-teal transition-colors shrink-0" />
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats row ─────────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Lessons scheduled"
              value={published?.slotCount ?? 0} color="teal" />
            <StatCard icon={<Layers className="h-5 w-5" />} label="Draft versions"
              value={draftCount} />
            <StatCard icon={<BarChart2 className="h-5 w-5" />} label="Operating days/week"
              value={templateInfo?.operatingDays ?? "—"} />
          </div>
        )}

        {/* ── Lesson distribution ────────────────────────────────────── */}
        {published && dayDist.some((d) => d > 0) && (
          <div className="bg-white border border-line rounded-xl p-5">
            <p className="text-sm font-semibold text-ink mb-4">Lessons per day (published)</p>
            <div className="flex items-end gap-3">
              {dayDist.map((count, i) => {
                if (count === 0 && i >= 5) return null;
                const maxCount = Math.max(...dayDist, 1);
                const heightPx = Math.max(8, Math.round((count / maxCount) * 80));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-slate">{count}</span>
                    <div className="w-full rounded-md bg-teal/70" style={{ height: `${heightPx}px` }} />
                    <span className="text-[10px] text-slate uppercase tracking-wide">{DAY_NAMES[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quick-access cards ──────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">All sections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NavCard href="/principal/timetable/template"    icon={<Clock className="h-5 w-5" />}
              title="Day Template"    description="Define the school-day format: lesson slots, breaks, lunch, games, and session times." accent="teal" />
            <NavCard href="/principal/timetable/requirements" icon={<BookOpen className="h-5 w-5" />}
              title="Requirements"   description="Set how many lessons per week each class needs for each subject." accent="blue" />
            <NavCard href="/principal/timetable/preferences"  icon={<Sun className="h-5 w-5" />}
              title="Preferences"    description="Tell the engine which subjects prefer morning or afternoon sessions." accent="amber" />
            <NavCard href="/principal/timetable/generate"     icon={<Zap className="h-5 w-5" />}
              title="Generate"       description="Run the constraint solver, review results, and publish." accent="purple" />
            <NavCard href="/principal/timetable/builder"      icon={<Wrench className="h-5 w-5" />}
              title="Builder"        description="Manually view, edit, and fine-tune any slot in the live grid." accent="teal" />
            <NavCard href="/principal/timetable/versions"     icon={<Layers className="h-5 w-5" />}
              title="Versions"       description="Manage drafts, clone between terms, and roll back." accent="blue" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color = "slate",
}: {
  icon: React.ReactNode; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-xl p-5 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
        ${color === "teal" ? "bg-teal/10 text-teal" : "bg-paper text-slate"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-ink leading-none mt-0.5">
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
  href: string; icon: React.ReactNode; title: string; description: string; accent: string;
}) {
  const bg: Record<string, string> = {
    teal:   "bg-teal/8 text-teal group-hover:bg-teal/15",
    blue:   "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    amber:  "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
    slate:  "bg-paper text-slate group-hover:bg-line",
  };
  return (
    <Link href={href}
      className="group bg-white border border-line rounded-xl p-5 flex flex-col gap-3
                 hover:border-teal/40 hover:shadow-sm transition-all duration-150">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${bg[accent] ?? bg.teal}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors flex items-center gap-1">
          {title}
          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </p>
        <p className="text-xs text-slate mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
