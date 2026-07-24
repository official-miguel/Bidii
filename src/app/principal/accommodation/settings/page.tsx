"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  Settings, BedDouble, Users, BarChart3,
  ShieldCheck, ArrowRight, CheckCircle2,
} from "lucide-react";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, FormField,
} from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",    label: "Overview", exact: true },
  { href: "/principal/accommodation/dormitories", label: "Dormitories" },
  { href: "/principal/accommodation/allocations", label: "Allocations" },
  { href: "/principal/accommodation/settings",    label: "Settings" },
];

interface AccomSettings {
  boardingType: string;
  schoolGenderPolicy: string;
  enableDormCaptains: boolean;
  enableTransfers: boolean;
  defaultAllocationPolicy: string;
  occupancyWarningPct: number;
  bedTrackingEnabled: boolean;
  analyticsEnabled: boolean;
  notifyOnAllocation: boolean;
  updatedAt: string | null;
}

const DEFAULT: AccomSettings = {
  boardingType: "DAY_AND_BOARDING", schoolGenderPolicy: "MIXED",
  enableDormCaptains: true, enableTransfers: true,
  defaultAllocationPolicy: "MIXED_FORMS", occupancyWarningPct: 90,
  bedTrackingEnabled: true, analyticsEnabled: true, notifyOnAllocation: false,
  updatedAt: null,
};

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink dark:text-dark-text">{label}</p>
        <p className="text-xs text-slate mt-0.5 leading-relaxed dark:text-dark-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 ${
          checked ? "bg-teal" : "bg-line dark:bg-dark-border"
        }`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`} />
      </button>
    </label>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, description, children,
}: { icon: typeof Settings; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border overflow-hidden">
      <div className="flex items-start gap-3 p-5 border-b border-line dark:border-dark-border bg-slate-50/60 dark:bg-dark-border/20">
        <div className="rounded-lg bg-teal/10 p-2 shrink-0">
          <Icon className="h-4 w-4 text-teal" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">{title}</p>
          <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">{description}</p>
        </div>
      </div>
      <div className="px-5 divide-y divide-line dark:divide-dark-border">{children}</div>
    </div>
  );
}

export default function AccommodationSettingsPage() {
  const [settings, setSettings] = useState<AccomSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/accommodation/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setSettings({ ...DEFAULT, ...d }); })
      .finally(() => setLoading(false));
  }, []);

  const patch = (p: Partial<AccomSettings>) => setSettings((s) => ({ ...s, ...p }));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/accommodation/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardingType: settings.boardingType,
          schoolGenderPolicy: settings.schoolGenderPolicy,
          enableDormCaptains: settings.enableDormCaptains,
          enableTransfers: settings.enableTransfers,
          defaultAllocationPolicy: settings.defaultAllocationPolicy,
          occupancyWarningPct: settings.occupancyWarningPct,
          bedTrackingEnabled: settings.bedTrackingEnabled,
          analyticsEnabled: settings.analyticsEnabled,
          notifyOnAllocation: settings.notifyOnAllocation,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
      setSettings({ ...DEFAULT, ...json });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="space-y-4 mt-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Accommodation Settings"
        description="Module-wide preferences for boarding management. Individual dorm configurations are set on each dormitory."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {saved && <div className="mb-4"><SuccessBanner message="Settings saved successfully." onDismiss={() => setSaved(false)} /></div>}

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">

        {/* Boarding type */}
        <SectionCard icon={BedDouble} title="School Boarding Configuration"
          description="Defines whether this school operates boarding and its gender admission policy.">
          <div className="py-4">
            <FormField label="Boarding type"
              helper="Controls whether the Accommodation module is active and which features are shown.">
              <select className={inputClass} value={settings.boardingType}
                onChange={(e) => patch({ boardingType: e.target.value })}>
                <option value="DAY_ONLY">Day School Only — boarding features hidden</option>
                <option value="BOARDING_ONLY">Boarding Only — all students are boarders</option>
                <option value="DAY_AND_BOARDING">Day &amp; Boarding — mixed student body</option>
              </select>
            </FormField>
          </div>
          <div className="py-4">
            <FormField label="School gender admission policy"
              helper="Used as the default gender option when registering new dormitories.">
              <select className={inputClass} value={settings.schoolGenderPolicy}
                onChange={(e) => patch({ schoolGenderPolicy: e.target.value })}>
                <option value="BOYS_ONLY">Boys Only</option>
                <option value="GIRLS_ONLY">Girls Only</option>
                <option value="MIXED">Mixed Gender</option>
              </select>
            </FormField>
          </div>
        </SectionCard>

        {/* Allocation */}
        <SectionCard icon={Users} title="Allocation Behaviour"
          description="Default policies applied when new dormitories are registered or students are allocated.">
          <div className="py-4">
            <FormField label="Default allocation policy for new dormitories"
              helper="Each dorm can override this. Use Restricted to enforce form-based separation by default.">
              <select className={inputClass} value={settings.defaultAllocationPolicy}
                onChange={(e) => patch({ defaultAllocationPolicy: e.target.value })}>
                <option value="MIXED_FORMS">Mixed Forms — any form may share a dorm</option>
                <option value="RESTRICTED_BY_FORM">Restricted by Form — only selected forms per dorm</option>
              </select>
            </FormField>
          </div>
          <ToggleRow
            label="Enable dorm captains"
            description="Allow a student to be assigned as the dorm captain of each dormitory."
            checked={settings.enableDormCaptains}
            onChange={(v) => patch({ enableDormCaptains: v })}
          />
          <ToggleRow
            label="Enable transfers"
            description="Allow students to be transferred between dormitories without being fully deallocated first."
            checked={settings.enableTransfers}
            onChange={(v) => patch({ enableTransfers: v })}
          />
        </SectionCard>

        {/* Occupancy */}
        <SectionCard icon={ShieldCheck} title="Occupancy & Capacity"
          description="Controls capacity tracking, warnings, and bed-level management.">
          <div className="py-4">
            <FormField label="Occupancy warning threshold (%)"
              helper="A dorm card turns amber and shows a warning when occupancy reaches or exceeds this percentage.">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={50} max={100} step={5}
                  value={settings.occupancyWarningPct}
                  onChange={(e) => patch({ occupancyWarningPct: parseInt(e.target.value) })}
                  className="flex-1 accent-teal"
                />
                <span className="text-sm font-semibold text-ink tabular-nums w-10 text-right dark:text-dark-text">
                  {settings.occupancyWarningPct}%
                </span>
              </div>
            </FormField>
          </div>
          <ToggleRow
            label="Enable bed-level tracking"
            description="Track individual beds and sleeping positions (Upper/Lower/Custom). When off, allocation is dorm-level only."
            checked={settings.bedTrackingEnabled}
            onChange={(v) => patch({ bedTrackingEnabled: v })}
          />
        </SectionCard>

        {/* Analytics & notifications */}
        <SectionCard icon={BarChart3} title="Analytics & Notifications"
          description="Dashboard widgets and automated notifications.">
          <ToggleRow
            label="Show analytics on dashboard"
            description="Display occupancy trends and boarding population charts on the accommodation overview."
            checked={settings.analyticsEnabled}
            onChange={(v) => patch({ analyticsEnabled: v })}
          />
          <ToggleRow
            label="Notify on allocation / transfer"
            description="Send a notification to the boarding master when a student is allocated or transferred to their dorm."
            checked={settings.notifyOnAllocation}
            onChange={(v) => patch({ notifyOnAllocation: v })}
          />
        </SectionCard>

        {/* Note */}
        <div className="rounded-lg border border-line bg-paper dark:bg-dark-surface dark:border-dark-border p-4 flex items-start gap-3">
          <ArrowRight className="h-4 w-4 text-slate mt-0.5 shrink-0" />
          <p className="text-xs text-slate leading-relaxed dark:text-dark-muted">
            Dorm-specific settings (structure, bed types, cubicle layouts, per-dorm allocation policies) are
            configured individually on each dormitory&rsquo;s registration page — not here.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          {settings.updatedAt && (
            <p className="text-xs text-slate dark:text-dark-muted">
              Last saved {new Date(settings.updatedAt).toLocaleDateString()}
            </p>
          )}
          <div className="ml-auto flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            <button type="submit" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
