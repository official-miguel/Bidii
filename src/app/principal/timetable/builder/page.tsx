"use client";
/**
 * /principal/timetable/builder — Stage 4 + Override-Control Manual Editor
 *
 * Stage 4 features (existing):
 *  • Class view + Teacher view, drag-and-drop, click-to-edit, keyboard nav
 *  • Undo/redo, copy/paste, multi-cell selection
 *  • Instant conflict detection, ConflictPanel, Auto Fix
 *  • Diff view vs published
 *
 * Override-control additions (this stage):
 *  • isManual badge (cyan "M" chip) on every manually placed/moved slot
 *  • isLocked badge (padlock icon) on locked slots
 *  • Lock / Unlock via right-click context menu on filled cells
 *  • Locked cells resist drag-and-drop (drag ignored if isLocked)
 *  • Re-optimize button → calls /reoptimize (preview), shows
 *    ReoptimizePreviewModal with full diff, then applies on confirm
 *  • Change history panel (collapsible, loads /history)
 */

import {
  useEffect, useState, useMemo, useCallback, useRef, type DragEvent,
} from "react";
import {
  BookOpen, User, RefreshCw, AlertCircle, AlertTriangle, History,
  CheckCircle2, Info, GitCompare, Keyboard, Sparkles,
  Undo2, Redo2, Lock, LockOpen,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  inputClass, labelClass,
  ErrorBanner, EmptyState,
} from "@/components/ui";
import { computePeriodTimes, type PeriodTime } from "@/lib/scheduleTimes";
import ConflictPanel         from "@/components/timetable/ConflictPanel";
import SlotEditModal, { type TeacherOption } from "@/components/timetable/SlotEditModal";
import ReoptimizePreviewModal, {
  type SlotDiff, type ReoptimizeDiffStats,
} from "@/components/timetable/ReoptimizePreviewModal";
import {
  detectLiveConflicts, classKey, teacherKey,
  type LiveSlot, type ConflictEngineConfig, type ConflictSummary, type CellConflict,
} from "@/lib/ai/timetableConflictEngine";

// ── Constants ──────────────────────────────────────────────────────────────
const NAV = [
  { href: "/principal/timetable",          label: "Overview", exact: true },
  { href: "/principal/timetable/builder",  label: "Builder"  },
  { href: "/principal/timetable/generate", label: "Generate" },
  { href: "/principal/timetable/versions", label: "Versions" },
  { href: "/principal/timetable/settings", label: "Settings" },
];
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const COLORS = [
  ["bg-teal-50",   "border-teal-200",   "text-teal-800"   ],
  ["bg-blue-50",   "border-blue-200",   "text-blue-800"   ],
  ["bg-purple-50", "border-purple-200", "text-purple-800" ],
  ["bg-emerald-50","border-emerald-200","text-emerald-800"],
  ["bg-amber-50",  "border-amber-200",  "text-amber-800"  ],
  ["bg-rose-50",   "border-rose-200",   "text-rose-800"   ],
  ["bg-cyan-50",   "border-cyan-200",   "text-cyan-800"   ],
  ["bg-orange-50", "border-orange-200", "text-orange-800" ],
  ["bg-lime-50",   "border-lime-200",   "text-lime-800"   ],
  ["bg-indigo-50", "border-indigo-200", "text-indigo-800" ],
];
const CONFLICT_CELL = "bg-danger/10 border-danger text-danger";
const WARN_CELL     = "bg-warn-bg border-warn text-warn";

// ── Types ──────────────────────────────────────────────────────────────────
type Version      = { id: string; name: string; status: string; slotCount: number };
type SchoolClass  = { id: string; name: string; form: number };
type Subject      = { id: string; name: string; code: string };
type Teacher      = { id: string; fullName: string; teacherSubjects: { subject: { id: string } }[] };
type TimetableCfg = {
  periodsPerDay: number; dayStartTime: string; periodDurationMinutes: number;
  breakAfterPeriod: number | null; breakDurationMinutes: number;
  lunchAfterPeriod: number | null; lunchDurationMinutes: number;
};
type SpecialPeriod = { type: string; label: string; dayOfWeek: number | null; period: number };

// Undo/redo entry
type UndoEntry = { slots: LiveSlot[]; label: string };

// ── Helpers ────────────────────────────────────────────────────────────────
let colorIdx = 0;
const subjectColorCache = new Map<string, number>();
function colorFor(subjectId: string): string[] {
  if (!subjectColorCache.has(subjectId)) subjectColorCache.set(subjectId, colorIdx++ % COLORS.length);
  return COLORS[subjectColorCache.get(subjectId)!];
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BuilderPage() {
  // ── Reference data ───────────────────────────────────────────────────────
  const [versions,   setVersions]   = useState<Version[]>([]);
  const [classes,    setClasses]    = useState<SchoolClass[]>([]);
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [teachers,   setTeachers]   = useState<Teacher[]>([]);
  const [config,     setConfig]     = useState<TimetableCfg | null>(null);
  const [specials,   setSpecials]   = useState<SpecialPeriod[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([0,1,2,3,4]);
  const [maxPerDay,  setMaxPerDay]  = useState(6);
  const [unavailMap, setUnavailMap] = useState<Map<string, Set<string>>>(new Map());
  const [reqMap,     setReqMap]     = useState<Map<string, number>>(new Map());
  const [doubleSet,  setDoubleSet]  = useState<Set<string>>(new Set());

  // ── Selection state ───────────────────────────────────────────────────────
  const [mode,      setMode]      = useState<"class"|"teacher">("class");
  const [versionId, setVersionId] = useState("published");
  const [classId,   setClassId]   = useState("");
  const [teacherId, setTeacherId] = useState("");

  // ── Timetable state ───────────────────────────────────────────────────────
  const [slots,   setSlots]   = useState<LiveSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Diff view: published slots for comparison
  const [diffSlots,  setDiffSlots]  = useState<LiveSlot[]>([]);
  const [showDiff,   setShowDiff]   = useState(false);

  // ── Undo/redo ─────────────────────────────────────────────────────────────
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  function pushUndo(label: string) {
    undoStack.current.push({ slots: [...slots], label });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }

  function undo() {
    const top = undoStack.current.pop();
    if (!top) return;
    redoStack.current.push({ slots: [...slots], label: top.label });
    setSlots(top.slots);
  }

  function redo() {
    const top = redoStack.current.pop();
    if (!top) return;
    undoStack.current.push({ slots: [...slots], label: top.label });
    setSlots(top.slots);
  }

  // ── Copy / paste ──────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<LiveSlot | null>(null);

  // ── Selection / focus ─────────────────────────────────────────────────────
  const [selectedCell, setSelectedCell] = useState<{ day: number; period: number } | null>(null);
  const [multiSel,     setMultiSel]     = useState<Set<string>>(new Set()); // "day-period"
  const [dragSrc,      setDragSrc]      = useState<LiveSlot | null>(null);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [editModal, setEditModal] = useState<{
    slot: LiveSlot | null; day: number; period: number;
  } | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError,  setModalError]  = useState<string | null>(null);

  // ── Conflict engine ───────────────────────────────────────────────────────
  const [conflictSummary, setConflictSummary] = useState<ConflictSummary>({
    totalErrors: 0, totalWarnings: 0,
    conflictMap: new Map(), conflictList: [],
  });
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [autoFixing,        setAutoFixing]        = useState(false);

  // ── Reoptimize preview ────────────────────────────────────────────────────
  const [reoptPreview,  setReoptPreview]  = useState<{ diff: SlotDiff[]; stats: ReoptimizeDiffStats } | null>(null);
  const [reoptimizing,  setReoptimizing]  = useState(false);
  const [reoptApplying, setReoptApplying] = useState(false);

  // ── Lock context menu ─────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ slot: LiveSlot; x: number; y: number } | null>(null);
  const [locking,     setLocking]     = useState(false);

  // ── History panel ─────────────────────────────────────────────────────────
  const [showHistory,    setShowHistory]    = useState(false);
  const [historyRows,    setHistoryRows]    = useState<Array<{
    id: string; actionLabel: string; changeSource: string | null;
    reason: string | null; performedAt: string;
    performer: { email: string; role: string } | null;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Help ──────────────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false);

  // ── Cell refs for scroll-to ───────────────────────────────────────────────
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  useEffect(() => {
    Promise.all([
      fetch("/api/timetable/v2/versions").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/staff").then((r) => r.json()),
      fetch("/api/timetable/v2/config").then((r) => r.json()),
      fetch("/api/timetable/unavailability").then((r) => r.json()),
    ]).then(([vs, cls, sub, tch, cfg, unav]) => {
      const vList: Version[] = vs ?? [];
      setVersions(vList);
      const classList: SchoolClass[] = cls?.classes ?? cls ?? [];
      setClasses(classList);
      const subList: Subject[] = sub?.subjects ?? sub ?? [];
      setSubjects(subList);
      const tchList: Teacher[] = tch?.teachers ?? tch ?? [];
      setTeachers(tchList);

      if (cfg?.config) setConfig(cfg.config);
      if (cfg?.config?.maxLessonsPerTeacherPerDay) setMaxPerDay(cfg.config.maxLessonsPerTeacherPerDay);
      if (cfg?.specialPeriods) setSpecials(cfg.specialPeriods);
      if (cfg?.operatingDays) {
        const a = (cfg.operatingDays as Array<{dayOfWeek:number;isActive:boolean}>)
          .filter((d) => d.isActive).map((d) => d.dayOfWeek);
        if (a.length) setActiveDays(a);
      }

      // Build unavailability map
      const um = new Map<string, Set<string>>();
      for (const t of (Array.isArray(unav) ? unav : [])) {
        const set = new Set<string>((t.unavailability ?? []).map((u: {dayOfWeek:number;period:number}) => `${u.dayOfWeek}-${u.period}`));
        um.set(t.id, set);
      }
      setUnavailMap(um);

      const pub = vList.find((v) => v.status === "PUBLISHED");
      if (pub) setVersionId(pub.id);
    }).catch(() => {});
  }, []);

  // ── Load slots ────────────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    if (mode === "class" && !classId) return;
    if (mode === "teacher" && !teacherId) return;
    setLoading(true); setError(null);
    try {
      let url = "";
      if (mode === "class" && versionId !== "published") {
        url = `/api/timetable/v2/versions/${versionId}/slots?classId=${classId}`;
      } else if (mode === "class") {
        url = `/api/timetable?classId=${classId}`;
      } else {
        const vp = versionId !== "published" ? `&versionId=${versionId}` : "";
        url = `/api/timetable/v2/teacher-view?teacherId=${teacherId}${vp}`;
      }
      const res  = await fetch(url);
      if (!res.ok) throw new Error("Failed to load timetable.");
      const data = await res.json();
      const raw  = (Array.isArray(data) ? data : (data.slots ?? [])) as LiveSlot[];
      // Ensure boolean defaults for fields added in migration
      setSlots(raw.map((s) => ({
        ...s,
        isManual: s.isManual ?? false,
        isLocked: s.isLocked ?? false,
      })));

      // Also load published diff
      if (versionId !== "published" && mode === "class") {
        const pub = versions.find((v) => v.status === "PUBLISHED");
        if (pub) {
          const dRes = await fetch(`/api/timetable/v2/versions/${pub.id}/slots?classId=${classId}`);
          if (dRes.ok) setDiffSlots(await dRes.json());
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, classId, teacherId, versionId, versions]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // ── Load requirements for conflict engine ─────────────────────────────────
  useEffect(() => {
    if (!classId || !classes.length || !subjects.length) return;
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    const rm  = new Map<string, number>();
    const ds  = new Set<string>();
    for (const s of subjects) {
      rm.set(`${classId}-${s.id}`, (s as unknown as {lessonsPerWeek?: number}).lessonsPerWeek ?? 0);
    }
    setReqMap(rm);
    setDoubleSet(ds);
  }, [classId, classes, subjects]);

  // ── Run conflict engine on every slot change ──────────────────────────────
  const conflictCfg = useMemo<ConflictEngineConfig>(() => {
    const blocked = new Set<string>();
    for (const sp of specials) {
      if (sp.dayOfWeek !== null) blocked.add(`${sp.dayOfWeek}-${sp.period}`);
      else activeDays.forEach((d) => blocked.add(`${d}-${sp.period}`));
    }
    return {
      operatingDays:              activeDays,
      periodsPerDay:              config?.periodsPerDay ?? 8,
      blockedSlots:               blocked,
      maxLessonsPerTeacherPerDay: maxPerDay,
      teacherUnavailability:      unavailMap,
      requiredLessons:            reqMap,
      doubleSubjects:             doubleSet,
    };
  }, [specials, activeDays, config, maxPerDay, unavailMap, reqMap, doubleSet]);

  useEffect(() => {
    if (!slots.length) {
      setConflictSummary({ totalErrors: 0, totalWarnings: 0, conflictMap: new Map(), conflictList: [] });
      return;
    }
    const s = detectLiveConflicts(slots, conflictCfg);
    setConflictSummary(s);
    if (s.totalErrors > 0 && !showConflictPanel) setShowConflictPanel(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, conflictCfg]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const periodTimes = useMemo<Map<number, PeriodTime>>(() => {
    if (!config) return new Map();
    return new Map(computePeriodTimes(config).map((t) => [t.period, t]));
  }, [config]);

  const periods = useMemo(
    () => Array.from({ length: config?.periodsPerDay ?? 8 }, (_, i) => i + 1),
    [config]
  );

  const slotMap = useMemo(() => {
    const m = new Map<string, LiveSlot>();
    slots.forEach((s) => m.set(`${s.dayOfWeek}-${s.period}`, s));
    return m;
  }, [slots]);

  const diffMap = useMemo(() => {
    const m = new Map<string, LiveSlot>();
    diffSlots.forEach((s) => m.set(`${s.dayOfWeek}-${s.period}`, s));
    return m;
  }, [diffSlots]);

  const isSpecial = useCallback((day: number, p: number) =>
    specials.some((sp) => sp.period === p && (sp.dayOfWeek === null || sp.dayOfWeek === day)),
    [specials]
  );

  const specialLabel = useCallback((day: number, p: number) => {
    const sp = specials.find((s) => s.period === p && (s.dayOfWeek === null || s.dayOfWeek === day));
    return sp?.label ?? "";
  }, [specials]);

  // Conflict key for a cell
  const getCellConflicts = useCallback((day: number, p: number) => {
    const ck = mode === "class"
      ? classKey(classId,   day, p)
      : teacherKey(teacherId, day, p);
    return conflictSummary.conflictMap.get(ck) ?? [];
  }, [conflictSummary, mode, classId, teacherId]);

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function onDragStart(e: DragEvent<HTMLButtonElement>, slot: LiveSlot) {
    if (slot.isLocked) { e.preventDefault(); return; }
    setDragSrc(slot);
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDrop(e: DragEvent<HTMLTableCellElement>, day: number, period: number) {
    e.preventDefault();
    if (!dragSrc || dragSrc.isLocked || !versionId || versionId === "published") return;
    if (dragSrc.dayOfWeek === day && dragSrc.period === period) return;
    pushUndo("Move lesson");
    // Optimistic update
    setSlots((prev) => prev.map((s) =>
      s.id === dragSrc.id ? { ...s, dayOfWeek: day, period } : s
    ));
    setDragSrc(null);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: dragSrc.id, dayOfWeek: day, period }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Move failed — reverting.");
      loadSlots();
    }
  }

  function onDragOver(e: DragEvent<HTMLTableCellElement>) {
    if (dragSrc) e.preventDefault();
  }

  // ── Add / edit slot ───────────────────────────────────────────────────────
  async function handleSaveSlot(subjectId: string, tId: string, room: string | null) {
    if (!editModal) return;
    setModalSaving(true); setModalError(null);
    const { slot, day, period } = editModal;

    if (slot && versionId !== "published") {
      // Edit: move + potentially change teacher
      pushUndo("Edit lesson");
      const res = await fetch(`/api/timetable/v2/versions/${versionId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, dayOfWeek: day, period, teacherId: tId, room }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error); setModalSaving(false); return; }
      setSlots((prev) => prev.map((s) => s.id === slot.id
        ? { ...s, dayOfWeek: day, period, teacherId: tId,
            teacherName: teachers.find((t) => t.id === tId)?.fullName ?? s.teacherName,
            subjectId, room, isManual: true }
        : s
      ));
    } else {
      // Add
      const apiUrl = versionId !== "published"
        ? `/api/timetable/v2/versions/${versionId}/slots`
        : "/api/timetable";
      const body = versionId !== "published"
        ? { classId, dayOfWeek: day, period, subjectId, teacherId: tId, room }
        : { classId, dayOfWeek: day, period, subjectId, teacherId: tId, room };
      const res  = await fetch(apiUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error); setModalSaving(false); return; }
      pushUndo("Add lesson");
      const sub = subjects.find((s) => s.id === subjectId);
      const tch = teachers.find((t) => t.id === tId);
      const newSlot: LiveSlot = {
        id: data.id ?? `tmp-${Date.now()}`,
        classId, className: classes.find((c) => c.id === classId)?.name ?? "",
        dayOfWeek: day, period, subjectId,
        subjectCode: sub?.code ?? "", teacherId: tId,
        teacherName: tch?.fullName ?? "", room, isDouble: false,
        isManual: true, isLocked: false,
      };
      setSlots((prev) => [...prev, newSlot]);
    }
    setModalSaving(false);
    setEditModal(null);
  }

  async function handleDeleteSlot(slot: LiveSlot) {
    pushUndo("Delete lesson");
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    if (versionId !== "published") {
      await fetch(`/api/timetable/v2/versions/${versionId}/slots?slotId=${slot.id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/timetable/${slot.id}`, { method: "DELETE" });
    }
  }

  // ── Auto-fix ──────────────────────────────────────────────────────────────
  async function handleAutoFix(classIds: string[]) {
    if (!versionId || versionId === "published") return;
    setAutoFixing(true);
    const res  = await fetch(`/api/timetable/v2/versions/${versionId}/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{ type: "AUTO_FIX", classIds }] }),
    });
    setAutoFixing(false);
    if (res.ok) loadSlots();
    else { const d = await res.json(); setError(d.error ?? "Auto-fix failed."); }
  }

  // ── Conflict jump ─────────────────────────────────────────────────────────
  function jumpToConflict(key: string) {
    const el = cellRefs.current.get(key);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
  }

  // ── Lock / unlock slot ────────────────────────────────────────────────────
  async function handleToggleLock(slot: LiveSlot, scope: string = "SLOT") {
    if (!versionId || versionId === "published") return;
    setLocking(true);
    setContextMenu(null);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: slot.id, lock: !slot.isLocked, scope }),
    });
    setLocking(false);
    if (res.ok) {
      setSlots((prev) => prev.map((s) => {
        if (scope === "SLOT" && s.id !== slot.id) return s;
        if (scope === "SUBJECT" && (s.classId !== slot.classId || s.subjectId !== slot.subjectId)) return s;
        if (scope === "CLASS"   && s.classId !== slot.classId) return s;
        if (scope === "DAY"     && (s.classId !== slot.classId || s.dayOfWeek !== slot.dayOfWeek)) return s;
        if (scope === "TEACHER" && s.teacherId !== slot.teacherId) return s;
        return { ...s, isLocked: !slot.isLocked, lockScope: scope };
      }));
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Lock toggle failed.");
    }
  }

  // ── Re-optimize ───────────────────────────────────────────────────────────
  async function handleReoptimize() {
    if (!versionId || versionId === "published") return;
    setReoptimizing(true); setError(null);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/reoptimize`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setReoptimizing(false);
    if (!res.ok) { setError(data.error ?? "Re-optimize failed."); return; }
    setReoptPreview({ diff: data.diff, stats: data.stats });
  }

  async function handleApplyReoptimize() {
    if (!versionId || !reoptPreview) return;
    setReoptApplying(true);
    const res = await fetch(
      `/api/timetable/v2/versions/${versionId}/reoptimize?apply=true`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    );
    setReoptApplying(false);
    setReoptPreview(null);
    if (res.ok) loadSlots();
    else { const d = await res.json(); setError(d.error ?? "Apply failed."); }
  }

  // ── History ───────────────────────────────────────────────────────────────
  async function loadHistory() {
    if (!versionId || versionId === "published") return;
    setHistoryLoading(true);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/history?limit=30`);
    const data = await res.json();
    setHistoryLoading(false);
    if (res.ok) setHistoryRows(data.entries ?? []);
  }

  function toggleHistory() {
    setShowHistory((o) => {
      if (!o) loadHistory();
      return !o;
    });
  }

  // ── Teacher options for modal ─────────────────────────────────────────────
  const teacherOptions = useMemo<TeacherOption[]>(() => {
    if (!editModal) return [];
    return teachers.map((t) => {
      const isEligible  = t.teacherSubjects?.some((ts) => ts.subject.id === (editModal.slot?.subjectId ?? ""));
      const slotK       = `${editModal.day}-${editModal.period}`;
      const isBusy      = slots.some((s) => s.teacherId === t.id && s.dayOfWeek === editModal.day && s.period === editModal.period && s.id !== editModal.slot?.id);
      const isUnavail   = unavailMap.get(t.id)?.has(slotK) ?? false;
      return { id: t.id, fullName: t.fullName, isEligible, isBusy, isUnavailable: isUnavail };
    });
  }, [editModal, teachers, slots, unavailMap]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "z") { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === "c" && selectedCell) {
        const s = slotMap.get(`${selectedCell.day}-${selectedCell.period}`);
        if (s) { setClipboard(s); return; }
      }
      if (ctrl && e.key === "v" && clipboard && selectedCell) {
        e.preventDefault();
        const sub = subjects.find((s) => s.id === clipboard.subjectId);
        const tch = teachers.find((t) => t.id === clipboard.teacherId);
        if (sub && tch) setEditModal({
          slot: null, day: selectedCell.day, period: selectedCell.period,
        });
        return;
      }
      if (e.key === "?" && !e.ctrlKey) { setShowHelp((o) => !o); return; }
      if (e.key === "Escape") { setSelectedCell(null); setMultiSel(new Set()); setEditModal(null); return; }
      if (e.key === "Delete" && selectedCell) {
        const s = slotMap.get(`${selectedCell.day}-${selectedCell.period}`);
        if (s) handleDeleteSlot(s);
        return;
      }

      // Arrow navigation
      if (!selectedCell) return;
      const days = activeDays;
      const dIdx = days.indexOf(selectedCell.day);
      if (e.key === "ArrowRight" && dIdx < days.length - 1) { e.preventDefault(); setSelectedCell({ day: days[dIdx + 1], period: selectedCell.period }); }
      if (e.key === "ArrowLeft"  && dIdx > 0)               { e.preventDefault(); setSelectedCell({ day: days[dIdx - 1], period: selectedCell.period }); }
      if (e.key === "ArrowDown"  && selectedCell.period < (config?.periodsPerDay ?? 8)) { e.preventDefault(); setSelectedCell({ day: selectedCell.day, period: selectedCell.period + 1 }); }
      if (e.key === "ArrowUp"    && selectedCell.period > 1)  { e.preventDefault(); setSelectedCell({ day: selectedCell.day, period: selectedCell.period - 1 }); }
      if (e.key === "Enter") { setEditModal({ slot: slotMap.get(`${selectedCell.day}-${selectedCell.period}`) ?? null, day: selectedCell.day, period: selectedCell.period }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCell, slotMap, clipboard, activeDays, config]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isDraft = versions.some((v) => v.id === versionId && v.status === "DRAFT");

  return (
    <div className="relative">
      <ContextNavigation items={NAV} />

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight">Timetable Editor</h1>
          <p className="text-slate text-sm mt-1">Drag-and-drop, click to edit, keyboard navigation.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Conflict badge */}
          <button
            onClick={() => setShowConflictPanel((o) => !o)}
            aria-label={`${conflictSummary.totalErrors} conflicts`}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors
              ${conflictSummary.totalErrors > 0
                ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/15"
                : conflictSummary.totalWarnings > 0
                  ? "bg-warn-bg border-warn/30 text-warn hover:bg-warn/15"
                  : "bg-success-bg border-success/20 text-success"
              }`}
          >
            {conflictSummary.totalErrors > 0
              ? <AlertCircle   className="h-3.5 w-3.5" aria-hidden />
              : conflictSummary.totalWarnings > 0
                ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                : <CheckCircle2  className="h-3.5 w-3.5" aria-hidden />
            }
            {conflictSummary.totalErrors > 0
              ? `${conflictSummary.totalErrors} conflict${conflictSummary.totalErrors !== 1 ? "s" : ""}`
              : conflictSummary.totalWarnings > 0
                ? `${conflictSummary.totalWarnings} warning${conflictSummary.totalWarnings !== 1 ? "s" : ""}`
                : "Clean"
            }
          </button>

          {/* Re-optimize */}
          {isDraft && mode === "class" && (
            <button
              onClick={handleReoptimize}
              disabled={reoptimizing}
              title="Re-optimize unlocked lessons"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal/40 bg-teal-50 text-teal text-xs font-semibold hover:bg-teal/10 transition-colors disabled:opacity-50"
            >
              {reoptimizing
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Sparkles  className="h-3.5 w-3.5" aria-hidden />
              }
              {reoptimizing ? "Analyzing…" : "Re-optimize"}
            </button>
          )}

          {/* History */}
          {isDraft && (
            <button
              onClick={toggleHistory}
              title="Change history"
              className={`p-2 rounded-lg border transition-colors ${showHistory ? "bg-teal/10 border-teal text-teal" : "border-line text-slate hover:text-teal hover:border-teal"}`}
            >
              <History className="h-4 w-4" aria-hidden /><span className="sr-only">History</span>
            </button>
          )}

          {/* Undo/Redo */}
          <button onClick={undo} disabled={!undoStack.current.length} title="Undo (Ctrl+Z)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors disabled:opacity-30">
            <Undo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Undo</span>
          </button>
          <button onClick={redo} disabled={!redoStack.current.length} title="Redo (Ctrl+Y)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors disabled:opacity-30">
            <Redo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Redo</span>
          </button>

          {/* Diff toggle */}
          {diffSlots.length > 0 && (
            <button onClick={() => setShowDiff((o) => !o)} title="Compare with published"
              className={`p-2 rounded-lg border transition-colors ${showDiff ? "bg-teal/10 border-teal text-teal" : "border-line text-slate hover:text-teal hover:border-teal"}`}>
              <GitCompare className="h-4 w-4" aria-hidden /><span className="sr-only">Diff view</span>
            </button>
          )}

          {/* Help */}
          <button onClick={() => setShowHelp((o) => !o)} title="Keyboard shortcuts (?)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
            <Keyboard className="h-4 w-4" aria-hidden /><span className="sr-only">Shortcuts</span>
          </button>

          <button onClick={loadSlots} title="Refresh"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            <span className="sr-only">Refresh</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Controls bar */}
      <div className="bg-white border border-line rounded-xl p-4 flex flex-wrap gap-3 items-end mb-4">
        {/* Mode toggle */}
        <div>
          <label className={labelClass}>View</label>
          <div className="flex rounded-lg border border-line overflow-hidden text-sm">
            {(["class","teacher"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSlots([]); setSelectedCell(null); }}
                className={`px-3 py-2 font-medium transition-colors ${mode === m ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper"}`}>
                {m === "class"
                  ? <><BookOpen className="h-4 w-4 inline mr-1" aria-hidden />Class</>
                  : <><User     className="h-4 w-4 inline mr-1" aria-hidden />Teacher</>}
              </button>
            ))}
          </div>
        </div>

        {/* Version picker */}
        <div className="min-w-[200px]">
          <label className={labelClass}>Version</label>
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)} className={inputClass}>
            <option value="published">Live (published)</option>
            {versions.filter((v) => v.status !== "PUBLISHED").map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({v.status})</option>
            ))}
          </select>
        </div>

        {/* Entity selector */}
        {mode === "class" ? (
          <div className="min-w-[180px]">
            <label className={labelClass}>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
              <option value="">Select a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="min-w-[200px]">
            <label className={labelClass}>Teacher</label>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputClass}>
              <option value="">Select a teacher…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </select>
          </div>
        )}

        {isDraft && (
          <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal text-xs font-medium">
            Editing draft
          </span>
        )}
      </div>

      {/* Main content — grid + optional conflict panel */}
      <div className="flex gap-4 items-start">
        {/* Timetable grid */}
        <div className="flex-1 min-w-0">
          {((mode === "class" && !classId) || (mode === "teacher" && !teacherId)) ? (
            <EmptyState message={mode === "class" ? "Select a class to edit its timetable." : "Select a teacher to view their schedule."} />
          ) : loading ? (
            <div className="bg-white border border-line rounded-xl p-10 text-center text-slate text-sm animate-pulse">
              Loading timetable…
            </div>
          ) : (
            <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse" style={{ minWidth: "640px" }}>
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide border-b border-r border-line w-20 sticky left-0 bg-slate-50/80 z-10">
                        Period
                      </th>
                      {activeDays.map((day) => (
                        <th key={day} className="px-3 py-3 text-xs font-semibold text-slate uppercase tracking-wide border-b border-line text-left">
                          {DAYS[day]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr key={period} className="hover:bg-slate-50/20 transition-colors">
                        <td className="px-3 py-2 border-r border-b border-line sticky left-0 bg-white z-10">
                          <div className="text-xs font-semibold text-ink">{period}</div>
                          {periodTimes.get(period) && (
                            <div className="text-[10px] text-slate/60 mt-0.5">{periodTimes.get(period)!.label}</div>
                          )}
                        </td>
                        {activeDays.map((day) => {
                          const slot     = slotMap.get(`${day}-${period}`);
                          const special  = isSpecial(day, period);
                          const cellConflicts = getCellConflicts(day, period);
                          const hasError   = cellConflicts.some((c) => c.severity === "error");
                          const hasWarning = !hasError && cellConflicts.some((c) => c.severity === "warning");
                          const isSelected = selectedCell?.day === day && selectedCell?.period === period;
                          const isMulti    = multiSel.has(`${day}-${period}`);

                          const ck = mode === "class"
                            ? classKey(classId, day, period)
                            : teacherKey(teacherId, day, period);

                          // Diff: check if this slot differs from published
                          const diffSlot = showDiff ? diffMap.get(`${day}-${period}`) : undefined;
                          const isDiffChanged = showDiff && diffSlot && slot &&
                            (diffSlot.subjectId !== slot.subjectId || diffSlot.teacherId !== slot.teacherId);
                          const isDiffAdded   = showDiff && slot && !diffSlot;
                          const isDiffRemoved = showDiff && !slot && diffSlot;

                          return (
                            <td key={day}
                              className={`border-b border-line p-1.5 align-top transition-colors
                                ${isSelected || isMulti ? "bg-teal-50/50 ring-1 ring-inset ring-teal/30" : ""}
                                ${isDiffChanged ? "bg-amber-50/30" : ""}
                                ${isDiffAdded   ? "bg-green-50/30" : ""}
                                ${isDiffRemoved ? "bg-red-50/30"   : ""}
                              `}
                              onDragOver={mode === "class" ? onDragOver : undefined}
                              onDrop={mode === "class"
                                ? (e: DragEvent<HTMLTableCellElement>) => onDrop(e, day, period)
                                : undefined
                              }
                              ref={(el) => {
                                if (el) cellRefs.current.set(ck, el);
                                else    cellRefs.current.delete(ck);
                              }}
                              onClick={() => {
                                setSelectedCell({ day, period });
                                setMultiSel(new Set());
                              }}
                            >
                              {special && !slot ? (
                                <div className="min-h-[60px] rounded-lg bg-paper border border-dashed border-line flex items-center justify-center px-1">
                                  <span className="text-[9px] text-slate/60 font-medium uppercase tracking-wide text-center">
                                    {specialLabel(day, period)}
                                  </span>
                                </div>
                              ) : slot ? (
                                <SlotCell
                                  slot={slot}
                                  mode={mode}
                                  hasError={hasError}
                                  hasWarning={hasWarning}
                                  conflicts={cellConflicts}
                                  isDraft={isDraft}
                                  onEdit={() => !slot.isLocked && setEditModal({ slot, day, period })}
                                  onDelete={() => !slot.isLocked && handleDeleteSlot(slot)}
                                  onDragStart={(e) => mode === "class" ? onDragStart(e, slot) : undefined}
                                  onContextMenu={(e) => {
                                    if (!isDraft) return;
                                    e.preventDefault();
                                    setContextMenu({ slot, x: e.clientX, y: e.clientY });
                                  }}
                                />
                              ) : mode === "class" ? (
                                <button
                                  aria-label={`Add lesson — ${DAYS[day]} period ${period}`}
                                  onClick={() => setEditModal({ slot: null, day, period })}
                                  className="w-full min-h-[60px] rounded-lg border-2 border-dashed
                                             border-line/60 text-slate/30 hover:border-teal hover:text-teal
                                             hover:bg-teal-50/20 flex items-center justify-center transition-all"
                                >
                                  <span className="text-lg font-light" aria-hidden>+</span>
                                </button>
                              ) : (
                                <div className="min-h-[60px] rounded-lg bg-slate-50/40 border border-dashed border-line/30" />
                              )}

                              {/* Diff removed indicator */}
                              {isDiffRemoved && (
                                <div className="mt-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1 opacity-60">
                                  <p className="text-[10px] font-semibold text-red-700 line-through">{diffSlot!.subjectCode}</p>
                                  <p className="text-[9px] text-red-600 line-through">{diffSlot!.teacherName}</p>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Diff legend */}
              {showDiff && (
                <div className="px-4 py-2 border-t border-line flex flex-wrap gap-3 text-xs text-slate">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200" />Added</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200" />Changed</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200"   />Removed</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-line" />Unchanged</span>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          {slots.length > 0 && (
            <p className="mt-2 text-xs text-slate flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {mode === "class"
                ? "Click to add/edit. Drag to move. Arrow keys navigate. Delete removes. ? for shortcuts."
                : "Teacher view is read-only. Switch to Class view to edit."}
            </p>
          )}
        </div>

        {/* Floating conflict panel */}
        {showConflictPanel && (
          <div className="shrink-0 w-full sm:w-80">
            <ConflictPanel
              summary={conflictSummary}
              onJumpTo={jumpToConflict}
              onAutoFix={handleAutoFix}
              onClose={() => setShowConflictPanel(false)}
              autoFixing={autoFixing}
            />
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editModal && mode === "class" && (
        <SlotEditModal
          slot={editModal.slot}
          targetDay={editModal.day}
          targetPeriod={editModal.period}
          classId={classId}
          className={classes.find((c) => c.id === classId)?.name ?? ""}
          subjects={subjects}
          teachers={teacherOptions}
          allSlots={slots}
          conflictCfg={conflictCfg}
          saving={modalSaving}
          error={modalError}
          onSave={handleSaveSlot}
          onClose={() => { setEditModal(null); setModalError(null); }}
        />
      )}

      {/* Keyboard shortcuts help */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
          onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-slate hover:text-ink">✕</button>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-line">
                {[
                  ["←↑→↓",        "Navigate cells"],
                  ["Enter",        "Edit focused cell"],
                  ["Delete",       "Remove lesson"],
                  ["Escape",       "Clear selection"],
                  ["Ctrl+Z",       "Undo"],
                  ["Ctrl+Y",       "Redo"],
                  ["Ctrl+C",       "Copy lesson"],
                  ["Ctrl+V",       "Paste lesson"],
                  ["?",            "Toggle this help"],
                ].map(([key, label]) => (
                  <tr key={key}>
                    <td className="py-1.5 pr-4">
                      <kbd className="px-1.5 py-0.5 bg-paper border border-line rounded text-[10px] font-mono">{key}</kbd>
                    </td>
                    <td className="py-1.5 text-slate">{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── History panel ─────────────────────────────────────────────── */}
      {showHistory && isDraft && (
        <div className="mt-4 bg-white border border-line rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-line">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <History className="h-4 w-4 text-teal" aria-hidden /> Change history
            </h3>
            <button onClick={() => setShowHistory(false)} className="text-slate hover:text-ink p-1">✕</button>
          </div>
          {historyLoading ? (
            <p className="p-5 text-sm text-slate animate-pulse">Loading…</p>
          ) : historyRows.length === 0 ? (
            <p className="p-5 text-sm text-slate">No changes recorded yet.</p>
          ) : (
            <div className="divide-y divide-line max-h-64 overflow-y-auto">
              {historyRows.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-start gap-3">
                  <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0
                    ${r.changeSource === "AI" ? "bg-purple-100 text-purple-700" : "bg-teal-50 text-teal"}`}>
                    {r.changeSource ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{r.actionLabel}</p>
                    {r.reason && <p className="text-xs text-slate mt-0.5 italic">{r.reason}</p>}
                    <p className="text-[10px] text-slate mt-0.5">
                      {r.performer?.email ?? "System"} · {new Date(r.performedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lock context menu ──────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-line rounded-xl shadow-xl py-1.5 w-52"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <p className="px-4 py-1.5 text-[10px] font-semibold text-slate uppercase tracking-wide border-b border-line">
            {contextMenu.slot.subjectCode} · {DAYS[contextMenu.slot.dayOfWeek]} P{contextMenu.slot.period}
          </p>
          {contextMenu.slot.isLocked ? (
            <button
              onClick={() => handleToggleLock(contextMenu.slot, contextMenu.slot.lockScope ?? "SLOT")}
              disabled={locking}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors"
            >
              <LockOpen className="h-4 w-4 text-teal shrink-0" aria-hidden /> Unlock this slot
            </button>
          ) : (
            <>
              {(["SLOT","SUBJECT","CLASS","DAY","TEACHER"] as const).map((scope) => (
                <button key={scope}
                  onClick={() => handleToggleLock(contextMenu.slot, scope)}
                  disabled={locking}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors"
                >
                  <Lock className="h-4 w-4 text-slate shrink-0" aria-hidden />
                  Lock {scope === "SLOT" ? "this slot" : scope === "SUBJECT" ? "all lessons (subject)" : scope === "CLASS" ? "entire class" : scope === "DAY" ? "all class lessons today" : "all teacher lessons"}
                </button>
              ))}
            </>
          )}
          {!contextMenu.slot.isLocked && (
            <button
              onClick={() => { setContextMenu(null); handleDeleteSlot(contextMenu.slot); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors border-t border-line mt-1"
            >
              Remove lesson
            </button>
          )}
        </div>
      )}

      {/* Backdrop to close context menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      {/* ── Re-optimize preview modal ──────────────────────────────────── */}
      {reoptPreview && (
        <ReoptimizePreviewModal
          diff={reoptPreview.diff}
          stats={reoptPreview.stats}
          applying={reoptApplying}
          onApply={handleApplyReoptimize}
          onDiscard={() => setReoptPreview(null)}
        />
      )}
    </div>
  );
}

// ── SlotCell ──────────────────────────────────────────────────────────────

function SlotCell({
  slot, mode, hasError, hasWarning, conflicts, isDraft,
  onEdit, onDelete: _onDelete, onDragStart, onContextMenu,
}: {
  slot:          LiveSlot;
  mode:          "class"|"teacher";
  hasError:      boolean;
  hasWarning:    boolean;
  conflicts:     CellConflict[];
  isDraft:       boolean;
  onEdit:        () => void;
  onDelete:      () => void;
  onDragStart:   (e: DragEvent<HTMLButtonElement>) => void;
  onContextMenu?:(e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const colors = colorFor(slot.subjectId);

  // Locked cells get a distinct teal-ring style
  const baseClass = slot.isLocked
    ? "bg-teal-50 border-teal-300 text-teal-800 ring-1 ring-inset ring-teal/30"
    : hasError
      ? CONFLICT_CELL
      : hasWarning
        ? WARN_CELL
        : `${colors[0]} ${colors[1]} ${colors[2]}`;

  const tooltip = slot.isLocked
    ? `🔒 Locked${slot.lockReason ? ` — ${slot.lockReason}` : ""}. Right-click to unlock.`
    : conflicts.map((c: CellConflict) => c.message).join("\n") || `${slot.subjectCode} — click to edit`;

  return (
    <button
      draggable={isDraft && mode === "class" && !slot.isLocked}
      onDragStart={onDragStart}
      onClick={onEdit}
      onContextMenu={onContextMenu}
      title={tooltip}
      aria-label={[
        `${slot.subjectCode} lesson`,
        mode === "class" ? `teacher: ${slot.teacherName}` : `class: ${slot.className}`,
        slot.isLocked   ? "Locked"              : "",
        slot.isManual   ? "Manual override"     : "AI generated",
        hasError        ? "Has conflict errors" : "",
        hasWarning      ? "Has conflict warnings" : "",
      ].filter(Boolean).join(", ")}
      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all group
        hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30
        ${baseClass}
        ${slot.isLocked ? "" : hasError ? "animate-pulse-subtle" : ""}
        ${slot.isLocked ? "cursor-default" : ""}
      `}
    >
      {/* Top row: subject code + status icons */}
      <div className="flex items-start justify-between gap-1">
        <p className="font-bold text-xs leading-tight truncate">{slot.subjectCode}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          {slot.isLocked  && <Lock          className="h-3 w-3 text-teal"   aria-label="Locked"          />}
          {slot.isManual && !slot.isLocked && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-teal/15 text-teal leading-none" aria-label="Manual override">M</span>
          )}
          {hasError   && <AlertCircle   className="h-3 w-3 text-danger" aria-label="Conflict error"   />}
          {hasWarning && <AlertTriangle className="h-3 w-3 text-warn"   aria-label="Conflict warning" />}
        </div>
      </div>

      {/* Secondary row: teacher or class name */}
      <p className="text-[11px] opacity-75 mt-0.5 truncate">
        {mode === "class" ? slot.teacherName : slot.className}
      </p>
      {slot.room && <p className="text-[10px] opacity-55 mt-0.5 truncate">{slot.room}</p>}

      {/* Lock reason tooltip line */}
      {slot.isLocked && slot.lockReason && (
        <p className="text-[9px] text-teal/70 mt-0.5 truncate italic">{slot.lockReason}</p>
      )}
    </button>
  );
}

// (end of file)
