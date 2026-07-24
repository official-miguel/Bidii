"use client";

/**
 * /principal/timetable/generate — Stage 2 AI-Assisted Generation
 *
 * Phases displayed:
 *   1. Setup       — scope, draft name, scheduling instructions
 *   2. Generating  — live progress indicator
 *   3. Results     — quality score ring, validation report, optimizer
 *                    summary, analytics dashboard, AI explanation,
 *                    preview grid, and publish/discard actions
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Sparkles, CheckCircle2, AlertTriangle, X, Plus,
  RefreshCw, Upload, Trash2, MessageSquare, Zap,
  ChevronDown, ChevronUp, Info, Shield, TrendingUp,
  AlertCircle, ArrowRight,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  primaryButtonClass, secondaryButtonClass, inputClass, labelClass,
  ErrorBanner,
} from "@/components/ui";

const NAV_ITEMS = [
  { href: "/principal/timetable",          label: "Overview",  exact: true },
  { href: "/principal/timetable/builder",  label: "Builder"   },
  { href: "/principal/timetable/generate", label: "Generate"  },
  { href: "/principal/timetable/versions", label: "Versions"  },
  { href: "/principal/timetable/settings", label: "Settings"  },
];

const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── Types ──────────────────────────────────────────────────────────────────
type SchoolClass    = { id: string; name: string; form: number };
type Constraint     = { id: string; instruction: string; parsed: { kind: string; summary: string } | null };
type ValidationPass = { name: string; label: string; passed: boolean; issueCount: number; issues: Array<{ severity: string; message: string; action: string }> };
type ValidationReport = { overallPassed: boolean; errorCount: number; warningCount: number; passes: ValidationPass[] };
type QualityMetric  = { name: string; label: string; score: number; weight: number; description: string };
type TeacherRow     = { teacherId: string; teacherName: string; totalLessons: number; byDay: Record<number, number>; idlePeriods: number; loadVariance: number };
type AnalyticsReport= { qualityMetrics: QualityMetric[]; overallQuality: number; teacherWorkload: TeacherRow[]; recommendations: string[]; aiExplanation: string | null; aiExplanationError: string | null };
type OptimizerSummary = { passesRun: number; movesApplied: number; spreadImproved: number; loadBalanced: number; qualityDelta: number; remainingIssues: string[] };
type DraftSlot      = { classId: string; className: string; dayOfWeek: number; period: number; subjectId: string; subjectCode: string; teacherId: string; teacherName: string; room: string | null; isDouble: boolean };
type GenerationResult = {
  versionId: string; name: string; slotCount: number; qualityScore: number;
  fullyPlaced: number; partiallyPlaced: number; notPlaced: number;
  warnings: string[]; validation: ValidationReport; optimizer: OptimizerSummary;
  analytics: AnalyticsReport; slots: DraftSlot[];
};

// ── Severity icon ──────────────────────────────────────────────────────────
function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error")   return <AlertCircle  className="h-3.5 w-3.5 text-danger shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-warn  shrink-0" />;
  return                             <Info          className="h-3.5 w-3.5 text-slate  shrink-0" />;
}

// ── Quality ring ───────────────────────────────────────────────────────────
function QualityRing({ score }: { score: number }) {
  const r     = 28;
  const circ  = 2 * Math.PI * r;
  const dash  = (score / 100) * circ;
  const color = score >= 80 ? "#17B26A" : score >= 60 ? "#F79009" : "#F04438";
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#E8EDF2" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-ink leading-none">{score}</span>
        <span className="text-[9px] text-slate uppercase tracking-wide">/ 100</span>
      </div>
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────
function Collapsible({ title, badge, badgeColor = "slate", defaultOpen = false, children }: {
  title: string; badge?: string | number; badgeColor?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const badgeClasses: Record<string, string> = {
    danger: "bg-danger/10 text-danger",
    warn:   "bg-warn/10 text-warn",
    success:"bg-success/10 text-success",
    slate:  "bg-line text-slate",
  };
  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-paper transition-colors">
        <span className="text-sm font-semibold text-ink flex-1">{title}</span>
        {badge !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClasses[badgeColor] ?? badgeClasses.slate}`}>
            {badge}
          </span>
        )}
        {open ? <ChevronUp className="h-4 w-4 text-slate" /> : <ChevronDown className="h-4 w-4 text-slate" />}
      </button>
      {open && <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────
export default function GeneratePage() {
  const [classes,     setClasses]     = useState<SchoolClass[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [, setLoading]                = useState(true);

  // Scope
  const [scopeAll,    setScopeAll]    = useState(true);
  const [selClassIds, setSelClassIds] = useState<Set<string>>(new Set());
  const [draftName,   setDraftName]   = useState("");

  // Options
  const [skipOptimizer,    setSkipOptimizer]    = useState(false);
  const [skipAiExplanation,setSkipAiExplanation]= useState(false);
  const [showOptions,      setShowOptions]      = useState(false);

  // Instructions
  const [instruction, setInstruction]   = useState("");
  const [sendingInst, setSendingInst]   = useState(false);

  // Generation
  const [generating, setGenerating]   = useState(false);
  const [result,     setResult]       = useState<GenerationResult | null>(null);
  const [genError,   setGenError]     = useState<string | null>(null);
  const [phase,      setPhase]        = useState<"idle"|"engine"|"validate"|"optimize"|"analytics"|"done">("idle");

  // Post-generation actions
  const [applying,   setApplying]     = useState(false);
  const [applied,    setApplied]      = useState(false);
  const [optimizing, setOptimizing]   = useState(false);
  const [revalidated,setRevalidated]  = useState<ValidationReport | null>(null);

  // Preview
  const [previewClass, setPreviewClass] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [clsRes, conRes] = await Promise.all([
      fetch("/api/classes"),
      fetch("/api/timetable/constraints"),
    ]);
    const cls = await clsRes.json().catch(() => ({}));
    const con = await conRes.json().catch(() => []);
    setClasses(cls?.classes ?? cls ?? []);
    setConstraints(Array.isArray(con) ? con : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!draftName)
      setDraftName(`Generated ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`);
  }, [draftName]);

  const forms = useMemo(() => [...new Set(classes.map((c) => c.form))].sort((a,b) => a-b), [classes]);

  function toggleClass(id: string) {
    setSelClassIds((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
  }
  function toggleForm(form: number) {
    const ids = classes.filter((c) => c.form === form).map((c) => c.id);
    const all = ids.every((id) => selClassIds.has(id));
    setSelClassIds((prev) => { const n = new Set(prev); ids.forEach((id) => all ? n.delete(id) : n.add(id)); return n; });
  }

  async function handleSendInstruction() {
    if (!instruction.trim()) return;
    setSendingInst(true);
    await fetch("/api/timetable/constraints", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }) });
    setSendingInst(false);
    setInstruction("");
    load();
  }

  async function handleRemoveConstraint(id: string) {
    await fetch(`/api/timetable/constraints/${id}`, { method: "DELETE" });
    load();
  }

  async function handleGenerate() {
    setGenerating(true); setGenError(null); setResult(null); setApplied(false); setRevalidated(null);

    // Simulate phase labels (purely cosmetic; the real pipeline runs server-side)
    const phases: Array<"engine"|"validate"|"optimize"|"analytics"> = ["engine","validate","optimize","analytics"];
    let pi = 0;
    const interval = setInterval(() => { if (pi < phases.length - 1) setPhase(phases[++pi]); }, 2200);
    setPhase("engine");

    try {
      const body: Record<string, unknown> = {
        name: draftName || "Generated draft",
        skipOptimizer, skipAiExplanation,
      };
      if (!scopeAll && selClassIds.size > 0) body.classIds = [...selClassIds];

      const res  = await fetch("/api/timetable/v2/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || "Generation failed."); return; }
      setResult(data);
      if (data.slots?.length > 0) setPreviewClass(data.slots[0].classId);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      clearInterval(interval);
      setPhase("done");
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!result?.versionId) return;
    setApplying(true);
    const res  = await fetch(`/api/timetable/v2/versions/${result.versionId}/publish`, { method: "POST" });
    const data = await res.json();
    setApplying(false);
    if (!res.ok) { setGenError(data.error); return; }
    setApplied(true);
  }

  async function handleOptimize() {
    if (!result?.versionId) return;
    setOptimizing(true);
    const res  = await fetch("/api/timetable/v2/optimize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: result.versionId, persist: true }),
    });
    const data = await res.json();
    setOptimizing(false);
    if (!res.ok) { setGenError(data.error); return; }
    setRevalidated(data.validation);
  }

  // Preview grid
  const previewSlots = useMemo(() => {
    if (!result || !previewClass) return new Map<string, DraftSlot>();
    const m = new Map<string, DraftSlot>();
    result.slots.filter((s) => s.classId === previewClass)
      .forEach((s) => m.set(`${s.dayOfWeek}-${s.period}`, s));
    return m;
  }, [result, previewClass]);

  const previewClasses = useMemo(() => {
    if (!result) return [];
    const seen = new Set<string>();
    return result.slots
      .filter((s) => { const n = !seen.has(s.classId); seen.add(s.classId); return n; })
      .map((s) => ({ id: s.classId, name: s.className }));
  }, [result]);

  const maxPeriod = useMemo(() => result ? Math.max(8, ...result.slots.map((s) => s.period)) : 8, [result]);
  const activeDays = useMemo(() => result ? [...new Set(result.slots.map((s) => s.dayOfWeek))].sort() : [0,1,2,3,4], [result]);

  const validation       = revalidated ?? result?.validation;
  const qualityScore     = result?.analytics?.overallQuality ?? result?.qualityScore ?? 0;
  const qualityColor     = qualityScore >= 80 ? "text-success" : qualityScore >= 60 ? "text-warn" : "text-danger";
  const PHASE_LABELS     = { idle:"",engine:"Running constraint solver…",validate:"Validating timetable…",optimize:"Optimizing lesson distribution…",analytics:"Building analytics report…",done:"" };

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight">Generate Timetable</h1>
          <p className="text-slate text-sm mt-1">AI-assisted constraint solver with validation and optimization.</p>
        </div>
        {result && !applied && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleOptimize} disabled={optimizing}
              className={`${secondaryButtonClass} text-xs`}>
              {optimizing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
              {optimizing ? "Optimizing…" : "Re-optimize"}
            </button>
            <button onClick={handlePublish} disabled={applying}
              className={`${primaryButtonClass} text-xs`}>
              <Upload className="h-3.5 w-3.5" />
              {applying ? "Publishing…" : "Publish"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {genError && <ErrorBanner message={genError} onDismiss={() => setGenError(null)} />}
        {applied && (
          <div className="rounded-xl bg-success-bg border border-success/20 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm font-semibold text-ink">Timetable published successfully. Teachers can now view their schedules.</p>
          </div>
        )}
        {revalidated && (
          <div className={`rounded-xl border px-5 py-3 text-sm flex items-center gap-2 ${revalidated.overallPassed ? "bg-success-bg border-success/20 text-success" : "bg-warn-bg border-warn/20 text-warn"}`}>
            <Shield className="h-4 w-4 shrink-0" />
            Post-optimization: {revalidated.errorCount} error(s), {revalidated.warningCount} warning(s).
          </div>
        )}

        {/* ── Setup card ──────────────────────────────────────────────── */}
        {!result && (
          <>
            <div className="bg-white border border-line rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Zap className="h-4 w-4 text-teal" /> Scope & name
              </h2>
              <div className="max-w-sm">
                <label className={labelClass}>Draft version name</label>
                <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputClass} />
              </div>
              <div className="flex gap-2">
                {(["all","subset"] as const).map((opt) => (
                  <button key={opt} onClick={() => setScopeAll(opt === "all")}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${(opt==="all")===scopeAll ? "bg-teal text-white border-teal" : "bg-white text-slate border-line hover:border-teal/40"}`}>
                    {opt === "all" ? "All classes" : "Select classes"}
                  </button>
                ))}
              </div>
              {!scopeAll && (
                <div className="space-y-3">
                  {forms.map((form) => (
                    <div key={form}>
                      <button onClick={() => toggleForm(form)}
                        className="text-xs font-semibold text-slate uppercase tracking-wide mb-1.5 hover:text-teal transition-colors">
                        Form {form}
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {classes.filter((c) => c.form === form).map((c) => (
                          <button key={c.id} onClick={() => toggleClass(c.id)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${selClassIds.has(c.id) ? "bg-teal text-white border-teal" : "bg-white text-slate border-line hover:border-teal/40"}`}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Options toggle */}
              <button onClick={() => setShowOptions((o) => !o)}
                className="text-xs text-teal font-medium hover:underline flex items-center gap-1">
                {showOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Advanced options
              </button>
              {showOptions && (
                <div className="flex flex-wrap gap-4 text-sm text-slate">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={skipOptimizer} onChange={(e) => setSkipOptimizer(e.target.checked)} className="rounded border-line" />
                    Skip optimizer (faster)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={skipAiExplanation} onChange={(e) => setSkipAiExplanation(e.target.checked)} className="rounded border-line" />
                    Skip AI explanation
                  </label>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-white border border-line rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal" /> Scheduling instructions
              </h2>
              <p className="text-xs text-slate">Examples: &quot;Schedule Mathematics in the first 3 periods&quot;, &quot;Avoid Sciences after period 6&quot;, &quot;Limit teachers to 5 lessons per day&quot;.</p>
              {constraints.map((c) => (
                <div key={c.id} className="flex items-start gap-2 p-3 bg-paper rounded-lg border border-line">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink">{c.instruction}</p>
                    {c.parsed?.summary && <p className="text-xs text-slate mt-0.5">→ {c.parsed.summary}</p>}
                  </div>
                  <button onClick={() => handleRemoveConstraint(c.id)} className="text-slate hover:text-danger transition-colors p-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendInstruction()}
                  placeholder="Add a scheduling instruction…"
                  className={`${inputClass} flex-1`} />
                <button onClick={handleSendInstruction} disabled={sendingInst || !instruction.trim()}
                  className={secondaryButtonClass}>
                  {sendingInst ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </div>
            </div>

            {/* Generate button */}
            <button onClick={handleGenerate}
              disabled={generating || (!scopeAll && selClassIds.size === 0)}
              className={`${primaryButtonClass} w-full sm:w-auto`}>
              {generating
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> {PHASE_LABELS[phase] || "Generating…"}</>
                : <><Sparkles className="h-4 w-4" /> Run engine</>}
            </button>
          </>
        )}

        {/* ── Phase progress bar ───────────────────────────────────────── */}
        {generating && (
          <div className="bg-white border border-line rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-teal animate-spin shrink-0" />
              <p className="text-sm font-medium text-ink">{PHASE_LABELS[phase]}</p>
            </div>
            <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-teal rounded-full transition-all duration-700"
                style={{ width: `${phase==="engine"?25:phase==="validate"?50:phase==="optimize"?75:phase==="analytics"?90:100}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate uppercase tracking-wide">
              {["Engine","Validate","Optimize","Analytics"].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && !generating && (
          <div className="space-y-4">
            {/* ── Quality + summary strip ─────────────────────────────── */}
            <div className="bg-white border border-line rounded-xl p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <QualityRing score={qualityScore} />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-ink">
                    Quality score: <span className={qualityColor}>{qualityScore}/100</span>
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-slate">
                    <span><span className="font-semibold text-ink">{result.slotCount}</span> lessons</span>
                    <span><span className="font-semibold text-success">{result.fullyPlaced}</span> subjects complete</span>
                    {result.partiallyPlaced > 0 && <span><span className="font-semibold text-warn">{result.partiallyPlaced}</span> partial</span>}
                    {result.notPlaced       > 0 && <span><span className="font-semibold text-danger">{result.notPlaced}</span> not placed</span>}
                    <span className={validation?.errorCount === 0 ? "text-success font-semibold" : "text-danger font-semibold"}>
                      {validation?.errorCount === 0 ? "✓ No errors" : `${validation?.errorCount} error(s)`}
                    </span>
                    {(validation?.warningCount ?? 0) > 0 && <span className="text-warn">{validation!.warningCount} warning(s)</span>}
                  </div>
                  {result.analytics?.recommendations?.length > 0 && (
                    <p className="text-xs text-slate/80 mt-1 leading-relaxed">
                      {result.analytics.recommendations[0]}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setResult(null); setPhase("idle"); }} className={secondaryButtonClass + " text-xs"}>
                    <Trash2 className="h-3.5 w-3.5" /> Discard
                  </button>
                  <button onClick={handlePublish} disabled={applying || applied}
                    className={`${primaryButtonClass} text-xs`}>
                    <Upload className="h-3.5 w-3.5" />
                    {applied ? "Published" : applying ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>

              {/* Metrics bar */}
              {result.analytics?.qualityMetrics && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {result.analytics.qualityMetrics.map((m) => (
                    <div key={m.name} className="text-center">
                      <div className="relative w-full bg-line rounded-full h-1 mb-1 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${m.score}%`,
                            background: m.score >= 80 ? "#17B26A" : m.score >= 60 ? "#F79009" : "#F04438",
                          }} />
                      </div>
                      <p className="text-[9px] text-slate/70 truncate" title={m.label}>{m.label}</p>
                      <p className="text-xs font-semibold text-ink">{m.score}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Validation report ────────────────────────────────────── */}
            {validation && (
              <Collapsible
                title="Validation report"
                badge={validation.errorCount + validation.warningCount}
                badgeColor={validation.errorCount > 0 ? "danger" : validation.warningCount > 0 ? "warn" : "success"}
                defaultOpen={validation.errorCount > 0}
              >
                <div className="space-y-2">
                  {validation.passes.map((p) => (
                    <div key={p.name}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${p.passed ? "bg-success-bg/50 border-success/20" : p.issues.some(i=>i.severity==="error") ? "bg-danger/5 border-danger/20" : "bg-warn-bg border-warn/20"}`}>
                      {p.passed
                        ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        : p.issues.some(i=>i.severity==="error")
                          ? <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                          : <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink">{p.label}</p>
                        {p.issueCount > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {p.issues.slice(0, 3).map((issue, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <SeverityIcon severity={issue.severity} />
                                <div className="min-w-0">
                                  <p className="text-xs text-ink/80">{issue.message}</p>
                                  <p className="text-xs text-teal mt-0.5 flex items-center gap-1">
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />{issue.action}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {p.issues.length > 3 && (
                              <p className="text-xs text-slate">…and {p.issues.length - 3} more.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}

            {/* ── Optimizer summary ────────────────────────────────────── */}
            {result.optimizer && (
              <Collapsible title="Optimization summary" badge={result.optimizer.movesApplied} defaultOpen={false}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    { label: "Passes run",       value: result.optimizer.passesRun     },
                    { label: "Moves applied",     value: result.optimizer.movesApplied  },
                    { label: "Spread improved",   value: result.optimizer.spreadImproved},
                    { label: "Load balanced",     value: result.optimizer.loadBalanced  },
                  ].map((s) => (
                    <div key={s.label} className="bg-paper rounded-xl border border-line p-3">
                      <p className="text-xl font-bold text-ink">{s.value}</p>
                      <p className="text-xs text-slate mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {result.optimizer.remainingIssues?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {result.optimizer.remainingIssues.map((issue, i) => (
                      <p key={i} className="text-xs text-slate flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 text-slate/50 shrink-0 mt-0.5" />{issue}
                      </p>
                    ))}
                  </div>
                )}
              </Collapsible>
            )}

            {/* ── AI explanation ───────────────────────────────────────── */}
            {result.analytics?.aiExplanation && (
              <Collapsible title="AI analysis & recommendations" defaultOpen={true}>
                <div className="flex gap-3">
                  <Sparkles className="h-4 w-4 text-teal shrink-0 mt-1" />
                  <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">
                    {result.analytics.aiExplanation}
                  </p>
                </div>
              </Collapsible>
            )}

            {/* ── Teacher workload ─────────────────────────────────────── */}
            {result.analytics?.teacherWorkload?.length > 0 && (
              <Collapsible title="Teacher workload" defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-paper">
                        <th className="px-3 py-2 text-left font-semibold text-slate border-b border-line">Teacher</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate border-b border-line">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate border-b border-line">Idle</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate border-b border-line">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.analytics.teacherWorkload.slice(0, 12).map((t) => (
                        <tr key={t.teacherId} className="hover:bg-paper/50 transition-colors">
                          <td className="px-3 py-2 border-b border-line font-medium text-ink">{t.teacherName}</td>
                          <td className="px-3 py-2 border-b border-line text-right text-ink">{t.totalLessons}</td>
                          <td className="px-3 py-2 border-b border-line text-right text-slate">{t.idlePeriods}</td>
                          <td className={`px-3 py-2 border-b border-line text-right font-medium ${t.loadVariance > 2 ? "text-warn" : "text-success"}`}>
                            {t.loadVariance.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Collapsible>
            )}

            {/* ── Recommendations ──────────────────────────────────────── */}
            {result.analytics?.recommendations?.length > 0 && (
              <Collapsible title="Recommendations" badge={result.analytics.recommendations.length} defaultOpen={result.notPlaced > 0}>
                <ul className="space-y-2">
                  {result.analytics.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink/80">
                      <ArrowRight className="h-4 w-4 text-teal shrink-0 mt-0.5" />{r}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}

            {/* ── Engine warnings ──────────────────────────────────────── */}
            {result.warnings?.length > 0 && (
              <Collapsible title="Scheduling warnings" badge={result.warnings.length} badgeColor="warn" defaultOpen={false}>
                <ul className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink/80">
                      <AlertTriangle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />{w}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}

            {/* ── Preview grid ─────────────────────────────────────────── */}
            <Collapsible title="Preview timetable" defaultOpen={true}>
              <div className="mb-3">
                <select value={previewClass} onChange={(e) => setPreviewClass(e.target.value)}
                  className={`${inputClass} max-w-xs`}>
                  {previewClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: "480px" }}>
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-left text-slate font-semibold border-b border-r border-line w-10">P</th>
                      {activeDays.map((d) => (
                        <th key={d} className="px-3 py-2 text-left text-slate font-semibold border-b border-line">{DAY_NAMES[d]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => (
                      <tr key={period}>
                        <td className="px-2 py-1.5 border-r border-b border-line font-semibold text-ink">{period}</td>
                        {activeDays.map((day) => {
                          const slot = previewSlots.get(`${day}-${period}`);
                          return (
                            <td key={day} className="border-b border-line p-1">
                              {slot ? (
                                <div className={`rounded-md px-2 py-1.5 border ${slot.isDouble ? "bg-purple-50 border-purple-200" : "bg-teal-50 border-teal-200"}`}>
                                  <p className="font-bold text-teal-800 leading-none">{slot.subjectCode}</p>
                                  <p className="text-[10px] text-slate/70 mt-0.5 truncate">{slot.teacherName}</p>
                                </div>
                              ) : (
                                <div className="h-9 rounded-md bg-slate-50/50 border border-dashed border-line/40" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </div>
        )}
      </div>
    </div>
  );
}
