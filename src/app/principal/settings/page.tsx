"use client";

import { useEffect, useState, FormEvent, useRef, useCallback } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, labelClass, secondaryButtonClass, royalButtonClass,
} from "@/components/ui";
import { SkeletonBar } from "@/components/ui/ProgressivePage";
import {
  CheckCircle2, AlertCircle, Zap, Calendar, MessageSquare,
  Mail, Key, Trash2, RefreshCw, BookOpen, BarChart3, Sparkles,
  Plug, ChevronRight,
} from "lucide-react";
import SomaAIConfigPanel from "@/components/SomaAIConfigPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Provider = "GEMINI" | "GOOGLE_CALENDAR" | "SMS" | "WHATSAPP" | "EMAIL";

type IntegrationStatus = {
  provider: Provider;
  configured: boolean;
  keyPreview: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

type SectionId = "integrations" | "ranking" | "library" | "ai";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar nav definition
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "integrations", label: "API Integrations",      sublabel: "Connect external services", Icon: Plug      },
  { id: "ranking",      label: "Ranking",               sublabel: "Teacher performance weights",Icon: BarChart3 },
  { id: "library",      label: "Library",               sublabel: "Borrowing rules & fines",   Icon: BookOpen  },
  { id: "ai",           label: "AI Configuration",      sublabel: "Soma AI & Gemini",           Icon: Sparkles  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Provider metadata
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_INFO: Record<Provider, {
  label: string; description: string; keyLabel: string;
  placeholder: string; testable?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  GEMINI: {
    label: "Google Gemini",
    description: "Powers the AI Timetable Generator, AI TOD Scheduler, and School Intelligence.",
    keyLabel: "API key", placeholder: "AIza...", testable: true,
    Icon: Zap,
  },
  GOOGLE_CALENDAR: {
    label: "Google Calendar",
    description: "Syncs the school calendar with Google Calendar for staff.",
    keyLabel: "API key", placeholder: "AIza...",
    Icon: Calendar,
  },
  SMS: {
    label: "SMS Provider",
    description: "Sends bulk SMS from the Communication Centre to parents and staff.",
    keyLabel: "API key / Auth token", placeholder: "",
    Icon: MessageSquare,
  },
  WHATSAPP: {
    label: "WhatsApp",
    description: "Sends WhatsApp messages to parents with a WhatsApp number on file.",
    keyLabel: "API key / Access token", placeholder: "",
    Icon: MessageSquare,
  },
  EMAIL: {
    label: "Email (SMTP)",
    description: "Sends email notifications from the Communication Centre.",
    keyLabel: "SMTP password / API key", placeholder: "",
    Icon: Mail,
  },
};

const PROVIDER_ORDER: Provider[] = ["GEMINI", "GOOGLE_CALENDAR", "SMS", "WHATSAPP", "EMAIL"];

// ─────────────────────────────────────────────────────────────────────────────
// RankingConfigForm  (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

interface RankingConfigData {
  improvementWeight: number;
  completionWeight: number;
  absoluteWeight: number;
  updatedAt: string | null;
}

function RankingConfigForm() {
  const [config, setConfig]         = useState<RankingConfigData | null>(null);
  const [improvement, setImprovement] = useState("0.40");
  const [completion,  setCompletion]  = useState("0.30");
  const [absolute,    setAbsolute]    = useState("0.30");
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    fetch("/api/settings/ranking-config")
      .then((r) => r.json())
      .then((d: RankingConfigData) => {
        setConfig(d);
        setImprovement(d.improvementWeight.toFixed(2));
        setCompletion(d.completionWeight.toFixed(2));
        setAbsolute(d.absoluteWeight.toFixed(2));
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load ranking configuration."));
  }, []);

  const sum = parseFloat(improvement || "0") + parseFloat(completion || "0") + parseFloat(absolute || "0");
  const sumValid = Math.abs(sum - 1.0) <= 0.001;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);
    const res = await fetch("/api/settings/ranking-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        improvementWeight: parseFloat(improvement),
        completionWeight:  parseFloat(completion),
        absoluteWeight:    parseFloat(absolute),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    setSavedAt(data.updatedAt); setConfig(data); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!config && !error) return (
    <div className="space-y-3">
      <SkeletonBar height="1rem" width="70%" />
      <div className="grid grid-cols-3 gap-4">
        <SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" />
      </div>
      <SkeletonBar height="2.25rem" width="8rem" />
    </div>
  );

  const fields = [
    { label: "Improvement weight", key: "improvement", value: improvement, set: setImprovement,
      hint: "Weight for score improvement over previous period." },
    { label: "Completion weight",  key: "completion",  value: completion,  set: setCompletion,
      hint: "Weight for marks-entry completion rate." },
    { label: "Absolute weight",    key: "absolute",    value: absolute,    set: setAbsolute,
      hint: "Weight for absolute class mean points." },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-xl">
      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="Weights saved successfully." />}
      <div className="rounded-xl bg-paper border border-line px-4 py-3 text-sm text-slate leading-relaxed dark:bg-dark-surface dark:border-dark-border">
        These three weights must sum to <strong className="text-ink dark:text-dark-text">1.0</strong>.
        They determine how the composite teacher ranking score is calculated each term.
      </div>
      <div className="grid grid-cols-3 gap-4">
        {fields.map(({ label, key, value, set, hint }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input type="number" step="0.01" min="0" max="1"
              value={value} onChange={(e) => set(e.target.value)} className={inputClass} />
            <p className="text-xs text-slate mt-1.5 leading-relaxed dark:text-dark-muted">{hint}</p>
          </div>
        ))}
      </div>
      <div className={`inline-flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2 ${
        sumValid
          ? "bg-success-bg text-success border border-success/20"
          : "bg-danger-bg text-danger border border-danger/20"
      }`}>
        {sumValid
          ? <CheckCircle2 className="h-4 w-4 shrink-0" />
          : <AlertCircle  className="h-4 w-4 shrink-0" />}
        Sum: {sum.toFixed(3)}{sumValid ? " — valid" : " — must equal 1.000"}
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving || !sumValid} className={royalButtonClass}>
          {saving ? "Saving…" : "Save weights"}
        </button>
        {savedAt && <span className="text-xs text-slate dark:text-dark-muted">Last saved: {new Date(savedAt).toLocaleString()}</span>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LibrarySettingsForm  (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

interface LibrarySettingsData {
  maxBooksPerStudent:   number;
  maxBorrowDays:        number;
  finePerDay:           number;
  maxRenewals:          number;
  identificationMethod: string;
  barcodeEnabled:       boolean;
  eligibleFromForm:     number | null;
  cardValidityDays:     number | null;
  overdueAlertDays:     number;
  updatedAt:            string | null;
}

function LibrarySettingsForm() {
  const [data,          setData]          = useState<LibrarySettingsData | null>(null);
  const [maxBooks,      setMaxBooks]      = useState("3");
  const [maxDays,       setMaxDays]       = useState("14");
  const [finePerDay,    setFinePerDay]    = useState("5.00");
  const [maxRenewals,   setMaxRenewals]   = useState("1");
  const [identMethod,   setIdentMethod]   = useState("MANUAL");
  const [barcodeEnabled,setBarcodeEnabled]= useState(false);
  const [eligibleFromForm, setEligibleFromForm] = useState("");
  const [cardValidityDays, setCardValidityDays] = useState("");
  const [overdueAlertDays, setOverdueAlertDays] = useState("7");
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    fetch("/api/library/settings")
      .then(r => r.json())
      .then((d: LibrarySettingsData) => {
        setData(d);
        setMaxBooks(String(d.maxBooksPerStudent));
        setMaxDays(String(d.maxBorrowDays));
        setFinePerDay(d.finePerDay.toFixed(2));
        setMaxRenewals(String(d.maxRenewals ?? 1));
        setIdentMethod(d.identificationMethod ?? "MANUAL");
        setBarcodeEnabled(d.barcodeEnabled ?? false);
        setEligibleFromForm(d.eligibleFromForm ? String(d.eligibleFromForm) : "");
        setCardValidityDays(d.cardValidityDays ? String(d.cardValidityDays) : "");
        setOverdueAlertDays(String(d.overdueAlertDays ?? 7));
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load library settings."));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);
    const res = await fetch("/api/library/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxBooksPerStudent:   parseInt(maxBooks),
        maxBorrowDays:        parseInt(maxDays),
        finePerDay:           parseFloat(finePerDay),
        maxRenewals:          parseInt(maxRenewals),
        identificationMethod: identMethod,
        barcodeEnabled,
        eligibleFromForm:     eligibleFromForm ? parseInt(eligibleFromForm) : null,
        cardValidityDays:     cardValidityDays ? parseInt(cardValidityDays) : null,
        overdueAlertDays:     parseInt(overdueAlertDays),
      }),
    });
    const d = await res.json(); setSaving(false);
    if (!res.ok) { setError(d.error ?? "Failed to save."); return; }
    setSavedAt(d.updatedAt); setData(d); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!data && !error) return (
    <div className="space-y-3">
      <SkeletonBar height="1rem" width="80%" />
      <div className="grid grid-cols-3 gap-4">
        <SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" />
      </div>
      <SkeletonBar height="2.25rem" width="8rem" />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-2xl">
      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="Library settings saved." />}

      {/* Borrowing rules */}
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-1">Borrowing Rules</h3>
        <p className="text-xs text-slate dark:text-dark-muted mb-4">Controls how many books students can borrow, how long, and what fines accrue.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Max books / student", value: maxBooks,   set: setMaxBooks,   min: "1",  max: "20",  hint: "Books at once" },
            { label: "Max borrow days",     value: maxDays,    set: setMaxDays,    min: "1",  max: "365", hint: "Before overdue" },
            { label: "Fine / day (KES)",    value: finePerDay, set: setFinePerDay, min: "0",  step: "0.50", hint: "Daily penalty" },
            { label: "Max renewals",        value: maxRenewals,set: setMaxRenewals,min: "0",  max: "10",  hint: "Per borrow" },
          ].map(({ label, hint, value, set, ...rest }) => (
            <div key={label}>
              <label className={labelClass}>{label}</label>
              <input type="number" value={value} onChange={e => set(e.target.value)} className={inputClass} {...rest} />
              <p className="text-xs text-slate dark:text-dark-muted mt-1">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Eligibility & card expiry */}
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-1">Eligibility & Card Expiry</h3>
        <p className="text-xs text-slate dark:text-dark-muted mb-4">Control which students are eligible for a library card and whether cards expire.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Eligible from form</label>
            <input type="number" min="1" max="8" className={inputClass} value={eligibleFromForm}
              onChange={e => setEligibleFromForm(e.target.value)} placeholder="All forms (blank)" />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Leave blank to include all forms.</p>
          </div>
          <div>
            <label className={labelClass}>Card validity (days)</label>
            <input type="number" min="1" max="3650" className={inputClass} value={cardValidityDays}
              onChange={e => setCardValidityDays(e.target.value)} placeholder="No expiry (blank)" />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Leave blank for no expiry.</p>
          </div>
          <div>
            <label className={labelClass}>Overdue alert (days)</label>
            <input type="number" min="1" max="365" className={inputClass} value={overdueAlertDays}
              onChange={e => setOverdueAlertDays(e.target.value)} />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Flag books overdue by this many days.</p>
          </div>
        </div>
      </div>

      {/* Identification method */}
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-1">Identification Method</h3>
        <p className="text-xs text-slate dark:text-dark-muted mb-4">How the librarian identifies students and books during circulation.</p>
        <div className="space-y-2">
          {[
            { value: "MANUAL",      label: "Manual input",     desc: "Type admission number or accession number by hand." },
            { value: "QR_CAMERA",   label: "Camera QR scan",   desc: "Use the device camera to scan QR codes on student cards and books." },
            { value: "QR_HARDWARE", label: "Hardware scanner",  desc: "USB or Bluetooth barcode/QR scanner auto-feeds characters." },
          ].map(opt => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              identMethod === opt.value
                ? "border-teal bg-teal-50 dark:bg-teal/10 dark:border-teal/40"
                : "border-line bg-white dark:bg-dark-surface dark:border-dark-border hover:border-teal/30"
            }`}>
              <input type="radio" name="identMethod" value={opt.value}
                checked={identMethod === opt.value} onChange={() => setIdentMethod(opt.value)}
                className="mt-0.5 accent-teal shrink-0" />
              <div>
                <p className="text-sm font-medium text-ink dark:text-dark-text">{opt.label}</p>
                <p className="text-xs text-slate dark:text-dark-muted">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" checked={barcodeEnabled}
            onChange={e => setBarcodeEnabled(e.target.checked)}
            className="rounded border-line accent-teal" />
          <span className="text-sm text-ink dark:text-dark-text">Enable barcode scanning in addition to QR codes</span>
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving} className={royalButtonClass}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {savedAt && <span className="text-xs text-slate dark:text-dark-muted">Last saved: {new Date(savedAt).toLocaleString()}</span>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IntegrationsPanel  (unchanged logic, extracted for clarity)
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationsPanel() {
  const [statuses,   setStatuses]   = useState<IntegrationStatus[] | null>(null);
  const [editing,    setEditing]    = useState<Provider | null>(null);
  const [intError,   setIntError]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [testResult, setTestResult] = useState<{ provider: Provider; ok: boolean; message: string } | null>(null);
  const [testing,    setTesting]    = useState<Provider | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/integrations");
    setStatuses(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function statusFor(p: Provider) { return statuses?.find((s) => s.provider === p) ?? null; }

  async function handleSaveKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setIntError(null); setSaving(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/settings/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: editing, apiKey: form.get("apiKey") }),
    });
    const data = await res.json(); setSaving(false);
    if (!res.ok) { setIntError(data.error || "Couldn't save this key."); return; }
    setStatuses(data); setEditing(null);
  }

  async function handleRemove(provider: Provider) {
    if (!confirm(`Remove the saved ${PROVIDER_INFO[provider].label} key? Features using it will stop working.`)) return;
    const res = await fetch(`/api/settings/integrations/${provider}`, { method: "DELETE" });
    if (res.ok) setStatuses(await res.json());
  }

  async function handleTest(provider: Provider) {
    setTesting(provider); setTestResult(null);
    const res = await fetch("/api/settings/integrations/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json(); setTesting(null);
    setTestResult({ provider, ok: !!data.ok,
      message: data.ok ? "Key works — connected successfully." : data.error || "Couldn't verify this key." });
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-ink dark:text-dark-text">API Integrations</h2>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          Connect external services. Keys are stored encrypted and never exposed to the browser.
        </p>
      </div>

      <div className="space-y-3 max-w-3xl">
        {PROVIDER_ORDER.map((provider) => {
          const info   = PROVIDER_INFO[provider];
          const status = statusFor(provider);
          const { Icon } = info;
          return (
            <div key={provider}
              className="rounded-xl bg-white border border-line shadow-sm p-5 flex items-start gap-4
                         hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border">
              <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                status?.configured ? "bg-teal-50 text-teal dark:bg-teal/10" : "bg-paper text-slate dark:bg-dark-bg dark:text-dark-muted"
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-ink dark:text-dark-text">{info.label}</p>
                  {status?.configured ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                                     bg-success-bg text-success border border-success/20">
                      <CheckCircle2 className="h-3 w-3" />
                      Configured · ···{status.keyPreview}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-line text-slate border border-line
                                     dark:bg-dark-border dark:text-dark-muted dark:border-dark-border">
                      Not configured
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate dark:text-dark-muted mt-1 leading-relaxed">{info.description}</p>
                {testResult?.provider === provider && (
                  <div className={`mt-2 flex items-center gap-1.5 text-sm ${testResult.ok ? "text-success" : "text-danger"}`}>
                    {testResult.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      : <AlertCircle  className="h-3.5 w-3.5 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {info.testable && status?.configured && (
                  <button className={secondaryButtonClass} disabled={testing === provider} onClick={() => handleTest(provider)}>
                    {testing === provider
                      ? <><RefreshCw className="h-4 w-4 animate-spin" />Testing…</>
                      : <><RefreshCw className="h-4 w-4" />Test</>}
                  </button>
                )}
                <button className={royalButtonClass} onClick={() => setEditing(provider)}>
                  <Key className="h-4 w-4" />
                  {status?.configured ? "Update key" : "Add key"}
                </button>
                {status?.configured && (
                  <button
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-line
                               text-slate hover:text-danger hover:bg-danger-bg/30 hover:border-danger/20
                               transition-all dark:border-dark-border dark:text-dark-muted"
                    onClick={() => handleRemove(provider)}
                    aria-label={`Remove ${info.label} key`}
                    title="Remove key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* API key modal */}
      {editing && (
        <Modal
          title={`${statusFor(editing)?.configured ? "Update" : "Add"} ${PROVIDER_INFO[editing].label} key`}
          description="This key is stored encrypted. Only the last 4 characters will be shown after saving."
          onClose={() => setEditing(null)}
          footer={
            <div className="flex justify-end gap-3">
              <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" form="api-key-form" className={royalButtonClass} disabled={saving}>
                <Key className="h-4 w-4" />{saving ? "Saving…" : "Save key"}
              </button>
            </div>
          }
        >
          <form id="api-key-form" onSubmit={handleSaveKey} className="space-y-4">
            {intError && <ErrorBanner message={intError} />}
            <div className="form-section">
              <div className="form-section-title">API Credentials</div>
              <div>
                <label className={labelClass}>
                  {PROVIDER_INFO[editing].keyLabel} <span className="text-danger">*</span>
                </label>
                <input name="apiKey" required autoComplete="off" type="password"
                  placeholder={PROVIDER_INFO[editing].placeholder || "Paste your key here"}
                  className={inputClass} autoFocus />
                <p className="text-xs text-slate dark:text-dark-muted mt-1.5 leading-relaxed">
                  Stored encrypted on the server. You won&apos;t be able to view it again after
                  saving — only the last 4 characters, to confirm which key is active.
                </p>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main SettingsPage — IG-style left sidebar + content panel
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>("integrations");
  const rankingRef = useRef<HTMLDivElement>(null);

  // Honour ?tab= or #ranking deep-links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as SectionId | null;
    if (t && SECTIONS.some((s) => s.id === t)) {
      setActive(t);
      if (t === "ranking")
        setTimeout(() => rankingRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } else if (window.location.hash === "#ranking") {
      setActive("ranking");
      setTimeout(() => rankingRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, []);

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Manage API integrations, AI configuration, teacher ranking weights, and library rules."
      />

      {/* ── Two-column shell ─────────────────────────────────────────────── */}
      <div className="flex gap-0 min-h-[600px] rounded-2xl border border-line overflow-hidden
                      dark:border-dark-border mt-2">

        {/* ── Left sidebar nav ──────────────────────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className="w-64 shrink-0 bg-paper border-r border-line
                     dark:bg-dark-surface dark:border-dark-border
                     flex flex-col py-2"
        >
          {SECTIONS.map(({ id, label, sublabel, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                aria-current={isActive ? "page" : undefined}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                  ${isActive
                    ? "bg-teal/8 border-r-2 border-teal text-teal dark:bg-teal/10"
                    : "text-slate hover:bg-white hover:text-ink dark:text-dark-muted dark:hover:bg-dark-bg dark:hover:text-dark-text border-r-2 border-transparent"
                  }
                `}
              >
                <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                  isActive ? "bg-teal/10 text-teal" : "bg-line/60 text-slate dark:bg-dark-border dark:text-dark-muted"
                }`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium leading-tight truncate ${
                    isActive ? "text-teal" : "text-ink dark:text-dark-text"
                  }`}>{label}</p>
                  <p className="text-[11px] text-slate dark:text-dark-muted truncate leading-tight mt-0.5">
                    {sublabel}
                  </p>
                </div>
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 ml-auto transition-opacity ${
                  isActive ? "opacity-100 text-teal" : "opacity-0"
                }`} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        {/* ── Content panel ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white dark:bg-dark-bg px-8 py-8 overflow-y-auto">

          {active === "integrations" && <IntegrationsPanel />}

          {active === "ranking" && (
            <div ref={rankingRef}>
              <div className="mb-6">
                <h2 className="text-base font-semibold text-ink dark:text-dark-text">
                  Ranking Configuration
                </h2>
                <p className="text-sm text-slate dark:text-dark-muted mt-1">
                  Adjust how the composite teacher performance score is weighted. Changes apply to
                  all future ranking calculations.
                </p>
              </div>
              <RankingConfigForm />
            </div>
          )}

          {active === "library" && (
            <div>
              <div className="mb-6">
                <h2 className="text-base font-semibold text-ink dark:text-dark-text">
                  Library Settings
                </h2>
                <p className="text-sm text-slate dark:text-dark-muted mt-1">
                  Configure borrowing limits, due dates, identification method, and overdue fines
                  for the school library.
                </p>
              </div>
              <LibrarySettingsForm />
            </div>
          )}

          {active === "ai" && (
            <div>
              <div className="mb-6">
                <h2 className="text-base font-semibold text-ink dark:text-dark-text">
                  AI Configuration
                </h2>
                <p className="text-sm text-slate dark:text-dark-muted mt-1">
                  Configure Soma AI — the intelligent assistant powered by Google Gemini. API keys
                  are encrypted at rest and never exposed to the browser.
                </p>
              </div>
              <SomaAIConfigPanel />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
