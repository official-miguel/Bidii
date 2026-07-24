"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, BedDouble, LayoutGrid, Plus,
  UserCheck, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, secondaryButtonClass, FormField,
} from "@/components/ui";
import Modal from "@/components/Modal";
import ContextNavigation from "@/components/ContextNavigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id: string; position: "UPPER" | "LOWER" | null; customLabel: string | null;
  isOccupied: boolean;
  allocations: {
    id: string; status: string;
    student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } };
  }[];
}
interface BedDetail { id: string; label: string; bedType: string; positions: Position[]; }
interface CubicleDetail {
  id: string; name: string; capacity: number; allocationPolicy: string | null;
  permittedForms: { form: number }[];
  _count: { beds: number; sleepingPositions: number; allocations: number };
}
interface DormDetail {
  id: string; name: string; genderPolicy: string; structure: string;
  status: string; totalCapacity: number; allocationPolicy: string;
  cubiclesInheritPolicy: boolean; description: string | null;
  boardingMaster: { id: string; fullName: string; staffId: string } | null;
  dormCaptain: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } } | null;
  permittedForms: { form: number }[];
  cubicles: CubicleDetail[];
  beds: BedDetail[];
  _count: { allocations: number; sleepingPositions: number };
}

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",    label: "Overview", exact: true },
  { href: "/principal/accommodation/dormitories", label: "Dormitories" },
  { href: "/principal/accommodation/allocations", label: "Allocations" },
  { href: "/principal/accommodation/settings",    label: "Settings" },
];

const GENDER_LABEL: Record<string, string> = { BOYS_ONLY: "Boys", GIRLS_ONLY: "Girls", MIXED: "Mixed" };
const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE:            { label: "Active",      color: "text-success" },
  UNDER_MAINTENANCE: { label: "Maintenance", color: "text-warn" },
  CLOSED:            { label: "Closed",      color: "text-slate" },
};

// ── OccupancyBar ──────────────────────────────────────────────────────────────

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warn" : "bg-teal";
  return (
    <div className="w-full h-2 rounded-full bg-line dark:bg-dark-border overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── BedCard ───────────────────────────────────────────────────────────────────

function BedCard({ bed }: { bed: BedDetail }) {
  const positionLabel = (p: Position) => {
    if (p.position === "UPPER") return "Upper";
    if (p.position === "LOWER") return "Lower";
    if (p.customLabel) return p.customLabel;
    return "Space";
  };
  return (
    <div className="rounded-lg border border-line dark:border-dark-border bg-card dark:bg-dark-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-ink dark:text-dark-text">{bed.label}</span>
        <span className="text-[10px] uppercase tracking-wide text-slate dark:text-dark-muted font-medium">
          {bed.bedType === "DOUBLE_DECKER" ? "Bunk" : bed.bedType === "CUSTOM" ? "Custom" : "Single"}
        </span>
      </div>
      <div className="space-y-1">
        {bed.positions.map((pos) => {
          const alloc = pos.allocations[0];
          return (
            <div key={pos.id}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                pos.isOccupied
                  ? "bg-teal/8 border border-teal/20 dark:bg-teal/10"
                  : "bg-slate-50 border border-line/50 dark:bg-dark-border/30 dark:border-dark-border/50"
              }`}
            >
              <span className={`font-medium shrink-0 ${pos.isOccupied ? "text-teal" : "text-slate dark:text-dark-muted"}`}>
                {positionLabel(pos)}
              </span>
              {alloc ? (
                <Link href={`/principal/students/${alloc.student.id}`}
                  className="text-ink hover:text-teal transition-colors truncate min-w-0 dark:text-dark-text dark:hover:text-teal">
                  {alloc.student.fullName}
                  <span className="text-slate ml-1 dark:text-dark-muted">· {alloc.student.schoolClass.name}</span>
                </Link>
              ) : (
                <span className="text-slate/60 dark:text-dark-muted/60">Vacant</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AddBedsModal ──────────────────────────────────────────────────────────────

function AddBedsModal({
  dormId, cubicleId, onClose, onAdded,
}: { dormId: string; cubicleId?: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"single" | "auto">("auto");
  const [bedType, setBedType] = useState("SINGLE");
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState("Bed ");
  const [singleLabel, setSingleLabel] = useState("");
  const [customOccupancy, setCustomOccupancy] = useState("3");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = mode === "auto"
        ? { mode: "auto", count: parseInt(count), prefix: prefix.trim() || "Bed ", bedType,
            customOccupancy: bedType === "CUSTOM" ? parseInt(customOccupancy) : null,
            cubicleId: cubicleId ?? null }
        : { label: singleLabel.trim(), bedType,
            customOccupancy: bedType === "CUSTOM" ? parseInt(customOccupancy) : null,
            cubicleId: cubicleId ?? null };
      const res = await fetch(`/api/accommodation/dormitories/${dormId}/beds`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onAdded();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Add Beds" description="Configure beds and their sleeping positions."
      onClose={onClose} size="sm"
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" form="add-beds-form" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Adding…" : mode === "auto" ? `Add ${count || "?"} beds` : "Add bed"}
          </button>
        </div>
      }>
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form id="add-beds-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-lg border border-line overflow-hidden dark:border-dark-border">
          {(["auto", "single"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper dark:bg-dark-surface dark:text-dark-muted dark:hover:bg-dark-border"
              }`}>
              {m === "auto" ? "Auto-generate" : "Single bed"}
            </button>
          ))}
        </div>
        {mode === "auto" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Number of beds" required>
                <input className={inputClass} type="number" min="1" max="500" value={count}
                  onChange={(e) => setCount(e.target.value)} />
              </FormField>
              <FormField label="Label prefix">
                <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Bed " />
              </FormField>
            </div>
          </>
        ) : (
          <FormField label="Bed label" required>
            <input className={inputClass} value={singleLabel} onChange={(e) => setSingleLabel(e.target.value)} placeholder="e.g. Bed 1" />
          </FormField>
        )}
        <FormField label="Bed type" required>
          <select className={inputClass} value={bedType} onChange={(e) => setBedType(e.target.value)}>
            <option value="SINGLE">Single (1 sleeping space)</option>
            <option value="DOUBLE_DECKER">Double-decker / Bunk (Upper + Lower)</option>
            <option value="CUSTOM">Custom occupancy</option>
          </select>
        </FormField>
        {bedType === "CUSTOM" && (
          <FormField label="Sleeping spaces per bed" helper="Each bed creates this many independent sleeping positions.">
            <input className={inputClass} type="number" min="1" max="20" value={customOccupancy}
              onChange={(e) => setCustomOccupancy(e.target.value)} />
          </FormField>
        )}
      </form>
    </Modal>
  );
}

// ── AddCubiclesModal ──────────────────────────────────────────────────────────

function AddCubiclesModal({ dormId, onClose, onAdded }: { dormId: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"auto" | "single">("auto");
  const [count, setCount] = useState("8");
  const [prefix, setPrefix] = useState("Cubicle ");
  const [capacityEach, setCapacityEach] = useState("4");
  const [singleName, setSingleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = mode === "auto"
        ? { mode: "auto", count: parseInt(count), prefix: prefix.trim() || "Cubicle ", capacityEach: parseInt(capacityEach) }
        : { name: singleName.trim(), capacity: parseInt(capacityEach) };
      const res = await fetch(`/api/accommodation/dormitories/${dormId}/cubicles`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onAdded();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Add Cubicles" description="Create one or more cubicles for this dormitory."
      onClose={onClose} size="sm"
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" form="add-cubicles-form" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Adding…" : mode === "auto" ? `Add ${count || "?"} cubicles` : "Add cubicle"}
          </button>
        </div>
      }>
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form id="add-cubicles-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-lg border border-line overflow-hidden dark:border-dark-border">
          {(["auto", "single"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper dark:bg-dark-surface dark:text-dark-muted dark:hover:bg-dark-border"
              }`}>
              {m === "auto" ? "Auto-generate" : "Single cubicle"}
            </button>
          ))}
        </div>
        {mode === "auto" ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Number of cubicles" required>
              <input className={inputClass} type="number" min="1" max="200" value={count}
                onChange={(e) => setCount(e.target.value)} />
            </FormField>
            <FormField label="Label prefix">
              <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Cubicle " />
            </FormField>
          </div>
        ) : (
          <FormField label="Cubicle name" required>
            <input className={inputClass} value={singleName} onChange={(e) => setSingleName(e.target.value)} placeholder="e.g. Room A" />
          </FormField>
        )}
        <FormField label="Capacity (beds per cubicle)" helper="Informational — actual spaces derive from beds you add.">
          <input className={inputClass} type="number" min="1" max="100" value={capacityEach}
            onChange={(e) => setCapacityEach(e.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}

// ── CubicleSection ────────────────────────────────────────────────────────────

function CubicleSection({
  cubicle, dormId, onAddBeds,
}: { cubicle: CubicleDetail; dormId: string; onAddBeds: (cubicleId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [beds, setBeds] = useState<BedDetail[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);

  async function fetchBeds() {
    if (beds.length > 0) { setExpanded((e) => !e); return; }
    setExpanded(true); setLoadingBeds(true);
    const res = await fetch(`/api/accommodation/dormitories/${dormId}/beds?cubicleId=${cubicle.id}`);
    if (res.ok) setBeds(await res.json());
    setLoadingBeds(false);
  }

  const pct = cubicle._count.sleepingPositions > 0
    ? Math.round((cubicle._count.allocations / cubicle._count.sleepingPositions) * 100) : 0;

  return (
    <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card dark:bg-dark-surface">
        <button className="flex items-center gap-3 flex-1 text-left min-w-0" onClick={fetchBeds}>
          <div className="rounded-md bg-teal/10 p-1.5 shrink-0">
            <LayoutGrid className="h-3.5 w-3.5 text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">{cubicle.name}</p>
            <p className="text-xs text-slate dark:text-dark-muted">
              {cubicle._count.beds} bed{cubicle._count.beds !== 1 ? "s" : ""} · {cubicle._count.allocations}/{cubicle._count.sleepingPositions} occupied
            </p>
          </div>
          <div className="w-24 shrink-0">
            <div className="flex items-center gap-1.5">
              <OccupancyBar pct={pct} />
              <span className="text-xs tabular-nums text-slate dark:text-dark-muted">{pct}%</span>
            </div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate shrink-0" />}
        </button>
        <button onClick={() => onAddBeds(cubicle.id)}
          className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all shrink-0" aria-label="Add beds">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line dark:border-dark-border bg-paper/50 dark:bg-dark-bg/30 p-4">
          {loadingBeds && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-line/40 animate-pulse" />)}
            </div>
          )}
          {!loadingBeds && beds.length === 0 && (
            <div className="text-center py-6">
              <p className="text-slate text-sm dark:text-dark-muted">No beds in this cubicle yet.</p>
              <button onClick={() => onAddBeds(cubicle.id)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-teal font-medium hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add beds
              </button>
            </div>
          )}
          {!loadingBeds && beds.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {beds.map((bed) => <BedCard key={bed.id} bed={bed} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DormDetailPage() {
  const { dormId } = useParams<{ dormId: string }>();
  const [dorm, setDorm] = useState<DormDetail | null>(null);
  const [beds, setBeds] = useState<BedDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAddBeds, setShowAddBeds] = useState(false);
  const [addBedsCubicleId, setAddBedsCubicleId] = useState<string | undefined>();
  const [showAddCubicles, setShowAddCubicles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/accommodation/dormitories/${dormId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setDorm(data);
    setBeds(data.beds ?? []);
    setLoading(false);
  }, [dormId]);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="space-y-4 mt-6">
          <div className="h-8 w-48 rounded bg-line/40 animate-pulse" />
          <div className="h-32 rounded-xl bg-line/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-line/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!dorm) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="py-20 text-center">
          <p className="text-slate dark:text-dark-muted">Dormitory not found.</p>
          <Link href="/principal/accommodation/dormitories" className="text-teal text-sm mt-2 inline-block hover:underline">
            Back to dormitories
          </Link>
        </div>
      </div>
    );
  }

  const occupancyPct = dorm.totalCapacity > 0
    ? Math.round((dorm._count.allocations / dorm.totalCapacity) * 100) : 0;
  const available = Math.max(0, dorm.totalCapacity - dorm._count.allocations);
  const statusMeta = STATUS_META[dorm.status];
  const isCubicleBased = dorm.structure === "CUBICLE_BASED";

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />

      {/* Back */}
      <div className="mb-4">
        <Link href="/principal/accommodation/dormitories"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-teal transition-colors dark:text-dark-muted dark:hover:text-teal">
          <ArrowLeft className="h-3.5 w-3.5" /> All dormitories
        </Link>
      </div>

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Header card */}
      <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="rounded-xl bg-teal/10 p-3 shrink-0 self-start">
            <BedDouble className="h-7 w-7 text-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-ink dark:text-dark-text">{dorm.name}</h1>
              <span className={`text-xs font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
              <span className="text-xs text-slate border border-line rounded-full px-2 py-0.5 dark:border-dark-border dark:text-dark-muted">
                {GENDER_LABEL[dorm.genderPolicy]}
              </span>
              <span className="text-xs text-slate border border-line rounded-full px-2 py-0.5 dark:border-dark-border dark:text-dark-muted">
                {isCubicleBased ? "Cubicle-based" : "Open hall"}
              </span>
            </div>
            {dorm.description && <p className="text-sm text-slate dark:text-dark-muted mb-2">{dorm.description}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate dark:text-dark-muted">
              {dorm.boardingMaster && (
                <span><span className="font-medium text-ink dark:text-dark-text">{dorm.boardingMaster.fullName}</span> · Boarding master</span>
              )}
              {dorm.dormCaptain && (
                <span><span className="font-medium text-ink dark:text-dark-text">{dorm.dormCaptain.fullName}</span> · Dorm captain</span>
              )}
            </div>
          </div>
          <Link href="/principal/accommodation/allocations"
            className="inline-flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/5 text-teal text-sm font-medium px-4 py-2 hover:bg-teal/10 transition-all shrink-0">
            <UserCheck className="h-4 w-4" /> Allocate students
          </Link>
        </div>

        {/* Occupancy summary row */}
        <div className="mt-4 pt-4 border-t border-line dark:border-dark-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total capacity", value: dorm.totalCapacity },
            { label: "Occupied", value: dorm._count.allocations, highlight: dorm._count.allocations === dorm.totalCapacity && dorm.totalCapacity > 0 },
            { label: "Available", value: available, highlight: available === 0 && dorm.totalCapacity > 0 },
            { label: "Occupancy", value: `${occupancyPct}%`, highlight: occupancyPct >= 90 },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-warn" : "text-ink dark:text-dark-text"}`}>{value}</p>
              <p className="text-xs text-slate dark:text-dark-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <OccupancyBar pct={occupancyPct} />
        </div>
      </div>

      {/* Structure section */}
      {isCubicleBased ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              Cubicles <span className="text-slate font-normal ml-1 text-sm dark:text-dark-muted">({dorm.cubicles.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => { setAddBedsCubicleId(undefined); setShowAddCubicles(true); }}
                className={secondaryButtonClass + " !py-2 !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add cubicles
              </button>
            </div>
          </div>

          {dorm.cubicles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-line dark:border-dark-border">
              <LayoutGrid className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm dark:text-dark-muted">No cubicles yet. Add cubicles to start organising this dorm.</p>
              <button onClick={() => setShowAddCubicles(true)} className={primaryButtonClass + " !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add cubicles
              </button>
            </div>
          )}

          <div className="space-y-3">
            {dorm.cubicles.map((c) => (
              <CubicleSection key={c.id} cubicle={c} dormId={dormId}
                onAddBeds={(cId) => { setAddBedsCubicleId(cId); setShowAddBeds(true); }} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              Beds <span className="text-slate font-normal ml-1 text-sm dark:text-dark-muted">({beds.length})</span>
            </h2>
            <button onClick={() => { setAddBedsCubicleId(undefined); setShowAddBeds(true); }}
              className={secondaryButtonClass + " !py-2 !text-xs"}>
              <Plus className="h-3.5 w-3.5" /> Add beds
            </button>
          </div>

          {beds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-line dark:border-dark-border">
              <BedDouble className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm dark:text-dark-muted">No beds yet. Add beds to configure sleeping positions.</p>
              <button onClick={() => setShowAddBeds(true)} className={primaryButtonClass + " !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add beds
              </button>
            </div>
          )}

          {beds.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {beds.map((bed) => <BedCard key={bed.id} bed={bed} />)}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddBeds && (
        <AddBedsModal dormId={dormId} cubicleId={addBedsCubicleId}
          onClose={() => setShowAddBeds(false)}
          onAdded={() => { setShowAddBeds(false); load(); flash("Beds added successfully."); }} />
      )}
      {showAddCubicles && (
        <AddCubiclesModal dormId={dormId}
          onClose={() => setShowAddCubicles(false)}
          onAdded={() => { setShowAddCubicles(false); load(); flash("Cubicles added successfully."); }} />
      )}
    </div>
  );
}
