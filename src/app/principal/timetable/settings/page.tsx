"use client";

/**
 * /principal/timetable/settings — Timetable Configuration
 *
 * Sections:
 *   1. School day — periods, start time, break/lunch/assembly, max teacher load
 *   2. Operating days — which days of the week the school runs
 *   3. Special periods — assembly, break, lunch, games, clubs, remedial, etc.
 *   4. Teacher availability — mark unavailable slots per teacher
 *   5. Subject workload rules — per-form lesson requirements and constraints
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Save, Plus, Trash2, Clock, CalendarDays,
  BookOpen, User, ChevronDown, ChevronUp,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  PageHeader, ErrorBanner,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
  FormField,
} from "@/components/ui";
import { computePeriodTimes } from "@/lib/scheduleTimes";

// ── Constants ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/principal/timetable",          label: "Overview",  exact: true },
  { href: "/principal/timetable/builder",  label: "Builder"  },
  { href: "/principal/timetable/generate", label: "Generate" },
  { href: "/principal/timetable/versions", label: "Versions" },
  { href: "/principal/timetable/settings", label: "Settings" },
];

const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const SPECIAL_TYPES = [
  { value: "ASSEMBLY", label: "Assembly"  },
  { value: "BREAK",    label: "Break"     },
  { value: "LUNCH",    label: "Lunch"     },
  { value: "GAMES",    label: "Games"     },
  { value: "CLUBS",    label: "Clubs"     },
  { value: "REMEDIAL", label: "Remedial"  },
  { value: "CHAPEL",   label: "Chapel"    },
  { value: "LIBRARY",  label: "Library"   },
  { value: "CUSTOM",   label: "Custom"    },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────
type Config = {
  periodsPerDay: number; dayStartTime: string; periodDurationMinutes: number;
  breakAfterPeriod: number | null; breakDurationMinutes: number;
  lunchAfterPeriod: number | null; lunchDurationMinutes: number;
  assemblyAfterPeriod: number | null; assemblyDurationMinutes: number;
  maxLessonsPerTeacherPerDay: number;
};

type OpDay  = { dayOfWeek: number; isActive: boolean; isHalfDay?: boolean };
type SpecialPeriod = {
  id?: string; type: string; label: string;
  dayOfWeek: number | null; period: number;
  durationMinutes: number | null; isActive: boolean; sortOrder: number;
};
type WorkloadRule = {
  id?: string; subjectId: string; subjectCode: string; subjectName: string;
  form: number; lessonsPerWeek: number; doubleLesson: boolean;
  consecutiveDouble: boolean; requiresSpecialRoom: string | null;
  maxPerDay: number | null; minSpreadDays: number | null;
  preferMorning: boolean; preferAfternoon: boolean;
};
type Subject = { id: string; name: string; code: string; applicableForms: number[] };
type Teacher = { id: string; fullName: string; unavailability: { dayOfWeek: number; period: number }[] };

// ── Component ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);

  const [config,         setConfig]         = useState<Config | null>(null);
  const [operatingDays,  setOperatingDays]  = useState<OpDay[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [workloadRules,  setWorkloadRules]  = useState<WorkloadRule[]>([]);

  // Reference data
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);

  // Expanded sections
  const [open, setOpen] = useState<Record<string,boolean>>({
    day: true, operating: false, special: false, availability: false, workload: false,
  });

  // Teacher availability editing
  const [selTeacher, setSelTeacher]         = useState("");
  const [unavailSel, setUnavailSel]         = useState<Set<string>>(new Set());
  const [savingUnavail, setSavingUnavail]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, subRes, tchRes] = await Promise.all([
        fetch("/api/timetable/v2/config"),
        fetch("/api/subjects"),
        fetch("/api/timetable/unavailability"),
      ]);
      const cfg = await cfgRes.json();
      const sub = await subRes.json();
      const tch = await tchRes.json();

      setConfig(cfg.config);
      setOperatingDays(
        cfg.operatingDays?.length > 0
          ? cfg.operatingDays
          : [0,1,2,3,4].map((d) => ({ dayOfWeek: d, isActive: true }))
      );
      setSpecialPeriods(cfg.specialPeriods ?? []);
      setWorkloadRules(cfg.workloadRules ?? []);
      setSubjects(sub?.subjects ?? sub ?? []);
      setTeachers(Array.isArray(tch) ? tch : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Computed period times for preview
  const periodTimes = useMemo(() => {
    if (!config) return [];
    return computePeriodTimes({
      periodsPerDay: config.periodsPerDay,
      dayStartTime:  config.dayStartTime,
      periodDurationMinutes: config.periodDurationMinutes,
      breakAfterPeriod:  config.breakAfterPeriod,
      breakDurationMinutes: config.breakDurationMinutes,
      lunchAfterPeriod:  config.lunchAfterPeriod,
      lunchDurationMinutes: config.lunchDurationMinutes,
    });
  }, [config]);

  const periods = useMemo(
    () => Array.from({ length: config?.periodsPerDay ?? 8 }, (_, i) => i + 1),
    [config]
  );

  async function handleSave() {
    if (!config) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/timetable/v2/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, operatingDays, specialPeriods, workloadRules }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not save settings."); return; }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(dayOfWeek: number) {
    setOperatingDays((prev) => prev.map((d) =>
      d.dayOfWeek === dayOfWeek ? { ...d, isActive: !d.isActive } : d
    ));
  }

  function addSpecialPeriod() {
    setSpecialPeriods((prev) => [
      ...prev,
      { type: "BREAK", label: "Break", dayOfWeek: null, period: 3,
        durationMinutes: 15, isActive: true, sortOrder: prev.length },
    ]);
  }

  function removeSpecialPeriod(idx: number) {
    setSpecialPeriods((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSpecialPeriod(idx: number, patch: Partial<SpecialPeriod>) {
    setSpecialPeriods((prev) => prev.map((sp, i) => i === idx ? { ...sp, ...patch } : sp));
  }

  function openTeacherAvailability(teacherId: string) {
    setSelTeacher(teacherId);
    const t = teachers.find((t) => t.id === teacherId);
    setUnavailSel(new Set(t?.unavailability.map((u) => `${u.dayOfWeek}-${u.period}`) ?? []));
  }

  async function saveUnavailability() {
    setSavingUnavail(true);
    const slots = [...unavailSel].map((k) => {
      const [d, p] = k.split("-").map(Number);
      return { dayOfWeek: d, period: p };
    });
    await fetch("/api/timetable/unavailability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: selTeacher, slots }),
    });
    setSavingUnavail(false);
    setSelTeacher("");
    load();
  }

  const activeDays = operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek);

  function toggle(key: string) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <PageHeader title="Timetable" description="Configure the schedule." />
        <div className="space-y-3 mt-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-line rounded-xl p-5 animate-pulse h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader title="Timetable" description="Configure school day structure, special periods, and workload rules." />

      <div className="space-y-4">
        {error   && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="rounded-xl border border-success/20 bg-success-bg p-4 text-sm text-success font-medium">
            Settings saved.
          </div>
        )}

        {/* ── Section: School day ──────────────────────────────────────── */}
        <Section icon={<Clock className="h-4 w-4" />} title="School day" sectionKey="day" open={open} onToggle={toggle}>
          {config && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <FormField label="Periods per day">
                <input type="number" min={1} max={16} value={config.periodsPerDay}
                  onChange={(e) => setConfig({ ...config, periodsPerDay: Number(e.target.value) })}
                  className={inputClass} />
              </FormField>
              <FormField label="Day start time">
                <input type="time" value={config.dayStartTime}
                  onChange={(e) => setConfig({ ...config, dayStartTime: e.target.value })}
                  className={inputClass} />
              </FormField>
              <FormField label="Period length (min)">
                <input type="number" min={5} max={180} value={config.periodDurationMinutes}
                  onChange={(e) => setConfig({ ...config, periodDurationMinutes: Number(e.target.value) })}
                  className={inputClass} />
              </FormField>
              <FormField label="Max teacher lessons/day">
                <input type="number" min={1} max={16} value={config.maxLessonsPerTeacherPerDay}
                  onChange={(e) => setConfig({ ...config, maxLessonsPerTeacherPerDay: Number(e.target.value) })}
                  className={inputClass} />
              </FormField>
              <FormField label="Break after period">
                <input type="number" min={0} max={16} placeholder="None"
                  value={config.breakAfterPeriod ?? ""}
                  onChange={(e) => setConfig({ ...config, breakAfterPeriod: e.target.value ? Number(e.target.value) : null })}
                  className={inputClass} />
              </FormField>
              <FormField label="Break length (min)">
                <input type="number" min={0} max={120} value={config.breakDurationMinutes}
                  onChange={(e) => setConfig({ ...config, breakDurationMinutes: Number(e.target.value) })}
                  className={inputClass} />
              </FormField>
              <FormField label="Lunch after period">
                <input type="number" min={0} max={16} placeholder="None"
                  value={config.lunchAfterPeriod ?? ""}
                  onChange={(e) => setConfig({ ...config, lunchAfterPeriod: e.target.value ? Number(e.target.value) : null })}
                  className={inputClass} />
              </FormField>
              <FormField label="Lunch length (min)">
                <input type="number" min={0} max={180} value={config.lunchDurationMinutes}
                  onChange={(e) => setConfig({ ...config, lunchDurationMinutes: Number(e.target.value) })}
                  className={inputClass} />
              </FormField>
            </div>
          )}
          {periodTimes.length > 0 && (
            <div className="mt-4 p-3 bg-paper rounded-lg border border-line">
              <p className="text-xs font-semibold text-slate mb-2 uppercase tracking-wide">Period preview</p>
              <div className="flex flex-wrap gap-2">
                {periodTimes.map((pt) => (
                  <span key={pt.period} className="text-xs bg-white border border-line rounded-md px-2 py-1">
                    <span className="font-semibold text-ink">{pt.period}</span>
                    <span className="text-slate ml-1">{pt.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ── Section: Operating days ──────────────────────────────────── */}
        <Section icon={<CalendarDays className="h-4 w-4" />} title="Operating days" sectionKey="operating" open={open} onToggle={toggle}>
          <div className="flex flex-wrap gap-2">
            {[0,1,2,3,4,5,6].map((d) => {
              const opDay = operatingDays.find((od) => od.dayOfWeek === d);
              const active = opDay?.isActive ?? false;
              return (
                <button
                  key={d}
                  onClick={() => {
                    if (opDay) {
                      toggleDay(d);
                    } else {
                      setOperatingDays((prev) => [...prev, { dayOfWeek: d, isActive: true }]);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                    ${active
                      ? "bg-teal text-white border-teal"
                      : "bg-white text-slate border-line hover:border-teal/40"
                    }`}
                >
                  {DAY_LABELS[d]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate mt-2">
            Active days: {activeDays.map((d) => SHORT_DAYS[d]).join(", ") || "None selected"}
          </p>
        </Section>

        {/* ── Section: Special periods ─────────────────────────────────── */}
        <Section icon={<CalendarDays className="h-4 w-4" />} title="Special periods" sectionKey="special" open={open} onToggle={toggle}>
          <div className="space-y-2">
            {specialPeriods.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center p-3 bg-paper rounded-lg border border-line">
                <select value={sp.type}
                  onChange={(e) => updateSpecialPeriod(idx, { type: e.target.value })}
                  className={inputClass}>
                  {SPECIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input value={sp.label}
                  onChange={(e) => updateSpecialPeriod(idx, { label: e.target.value })}
                  placeholder="Label" className={inputClass} />
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-slate shrink-0">P</span>
                  <input type="number" min={1} max={16} value={sp.period}
                    onChange={(e) => updateSpecialPeriod(idx, { period: Number(e.target.value) })}
                    className={inputClass} />
                </div>
                <select
                  value={sp.dayOfWeek ?? ""}
                  onChange={(e) => updateSpecialPeriod(idx, { dayOfWeek: e.target.value ? Number(e.target.value) : null })}
                  className={inputClass}>
                  <option value="">Every day</option>
                  {activeDays.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
                <button onClick={() => removeSpecialPeriod(idx)}
                  className="p-2 rounded-lg border border-line text-slate hover:text-danger hover:border-danger transition-colors justify-self-end">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={addSpecialPeriod}
              className="flex items-center gap-2 text-sm text-teal font-medium hover:underline">
              <Plus className="h-4 w-4" /> Add special period
            </button>
          </div>
        </Section>

        {/* ── Section: Teacher availability ────────────────────────────── */}
        <Section icon={<User className="h-4 w-4" />} title="Teacher availability" sectionKey="availability" open={open} onToggle={toggle}>
          <div className="space-y-4">
            <div className="max-w-xs">
              <label className={labelClass}>Teacher</label>
              <select value={selTeacher}
                onChange={(e) => openTeacherAvailability(e.target.value)} className={inputClass}>
                <option value="">Select a teacher…</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </div>

            {selTeacher && (
              <div className="space-y-3">
                <p className="text-xs text-slate">
                  Click slots where this teacher is <strong>unavailable</strong> (e.g. part-time, meetings).
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate font-medium border-b border-r border-line w-16">Period</th>
                        {activeDays.map((d) => (
                          <th key={d} className="px-3 py-1.5 text-slate font-medium border-b border-line min-w-[64px]">
                            {SHORT_DAYS[d]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((p) => (
                        <tr key={p}>
                          <td className="px-2 py-1 border-r border-b border-line font-medium text-ink">{p}</td>
                          {activeDays.map((d) => {
                            const k = `${d}-${p}`;
                            const blocked = unavailSel.has(k);
                            return (
                              <td key={d} className="border-b border-line p-1">
                                <button
                                  onClick={() => {
                                    const next = new Set(unavailSel);
                                    if (blocked) { next.delete(k); } else { next.add(k); }
                                    setUnavailSel(next);
                                  }}
                                  className={`w-full h-8 rounded transition-colors text-[10px] font-medium
                                    ${blocked
                                      ? "bg-danger/15 text-danger border border-danger/20"
                                      : "bg-paper hover:bg-teal-50 text-slate/40 border border-line"
                                    }`}
                                >
                                  {blocked ? "×" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={saveUnavailability} disabled={savingUnavail} className={primaryButtonClass}>
                  {savingUnavail ? "Saving…" : "Save availability"}
                </button>
              </div>
            )}
          </div>
        </Section>

        {/* ── Section: Workload rules ──────────────────────────────────── */}
        <Section icon={<BookOpen className="h-4 w-4" />} title="Subject workload rules" sectionKey="workload" open={open} onToggle={toggle}>
          <div className="space-y-3">
            <p className="text-xs text-slate">
              Override the default lessons-per-week from the subject settings. Leave blank to use the subject&apos;s default.
            </p>
            {workloadRules.length === 0 ? (
              <p className="text-sm text-slate/60 italic">No custom workload rules. The engine uses each subject&apos;s default lessons-per-week.</p>
            ) : (
              <div className="space-y-2">
                {workloadRules.map((r, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center p-3 bg-paper rounded-lg border border-line text-sm">
                    <span className="font-semibold text-ink min-w-[80px]">{r.subjectCode}</span>
                    <span className="text-slate">Form {r.form}</span>
                    <input type="number" min={0} max={30} value={r.lessonsPerWeek}
                      onChange={(e) => setWorkloadRules((prev) => prev.map((x, i) => i === idx ? { ...x, lessonsPerWeek: Number(e.target.value) } : x))}
                      className={`${inputClass} w-16`} />
                    <span className="text-slate text-xs">lessons/wk</span>
                    <label className="flex items-center gap-1 text-xs text-slate cursor-pointer">
                      <input type="checkbox" checked={r.doubleLesson}
                        onChange={(e) => setWorkloadRules((prev) => prev.map((x,i) => i === idx ? { ...x, doubleLesson: e.target.checked } : x))}
                        className="rounded border-line" />
                      Double
                    </label>
                    <button onClick={() => setWorkloadRules((prev) => prev.filter((_,i) => i !== idx))}
                      className="ml-auto p-1.5 text-slate hover:text-danger transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add rule form */}
            <AddWorkloadRuleForm subjects={subjects} onAdd={(rule) => setWorkloadRules((prev) => [...prev, rule])} />
          </div>
        </Section>

        {/* ── Save all ─────────────────────────────────────────────────── */}
        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save all settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section accordion ──────────────────────────────────────────────────────
function Section({
  icon, title, sectionKey, open, onToggle, children,
}: {
  icon: React.ReactNode; title: string; sectionKey: string;
  open: Record<string, boolean>; onToggle: (k: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = open[sectionKey] ?? false;
  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-paper transition-colors"
      >
        <span className="text-teal">{icon}</span>
        <span className="text-sm font-semibold text-ink flex-1">{title}</span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-slate" /> : <ChevronDown className="h-4 w-4 text-slate" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-line">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

// ── Add workload rule sub-form ─────────────────────────────────────────────
function AddWorkloadRuleForm({
  subjects,
  onAdd,
}: {
  subjects: Subject[];
  onAdd: (rule: WorkloadRule) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [form,      setForm]      = useState("");
  const [lessons,   setLessons]   = useState("5");

  const subject = subjects.find((s) => s.id === subjectId);
  const availForms = subject?.applicableForms ?? [1,2,3,4];

  function add() {
    if (!subjectId || !form) return;
    onAdd({
      subjectId,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "",
      form: Number(form),
      lessonsPerWeek: Number(lessons),
      doubleLesson: false, consecutiveDouble: false,
      requiresSpecialRoom: null, maxPerDay: null, minSpreadDays: null,
      preferMorning: false, preferAfternoon: false,
    });
    setSubjectId(""); setForm(""); setLessons("5");
  }

  return (
    <div className="flex flex-wrap gap-2 items-end pt-2 border-t border-line">
      <div className="min-w-[160px]">
        <label className={labelClass}>Subject</label>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
        </select>
      </div>
      <div className="w-24">
        <label className={labelClass}>Form</label>
        <select value={form} onChange={(e) => setForm(e.target.value)} className={inputClass} disabled={!subjectId}>
          <option value="">–</option>
          {availForms.map((f) => <option key={f} value={f}>Form {f}</option>)}
        </select>
      </div>
      <div className="w-24">
        <label className={labelClass}>Lessons/wk</label>
        <input type="number" min={0} max={30} value={lessons}
          onChange={(e) => setLessons(e.target.value)} className={inputClass} />
      </div>
      <button onClick={add} disabled={!subjectId || !form} className={secondaryButtonClass}>
        <Plus className="h-4 w-4" /> Add rule
      </button>
    </div>
  );
}
