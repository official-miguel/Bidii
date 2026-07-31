"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageHeader,
  EmptyState,
  Chip,
  ErrorBanner,
  primaryButtonClass,
  secondaryButtonClass,
  inputClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import {
  ArrowLeft, CheckCircle2, AlertCircle, Layers,
  Plus, X, ExternalLink, User,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ClassInfo = {
  id: string;
  name: string;
  stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE";
  _count: { students: number };
};

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  globalType: "CORE" | "ELECTIVE";
  effectiveType: "CORE" | "ELECTIVE";
  mixed: boolean;
  classOverrides: Record<string, "CORE" | "ELECTIVE">;
  department: { id: string; name: string };
};

type GroupMember = {
  id: string;
  subjectId: string;
  subject: { id: string; code: string; name: string };
};

type GroupTeacher = {
  id: string;
  subjectId: string;
  teacherId: string;
  subject: { id: string; code: string; name: string };
  teacher: { id: string; fullName: string };
};

type ElectiveGroup = {
  id: string;
  name: string;
  scopeForm: number;
  scopeStreams: string[];
  lessonsPerWeek: number;
  members: GroupMember[];
  teachers: GroupTeacher[];
};

type StaffTeacher = {
  id: string;
  fullName: string;
  teacherSubjects: { subject: { id: string; name: string; code: string } }[];
};

type FormData = {
  form: number;
  classes: ClassInfo[];
  subjects: SubjectRow[];
  electiveGroups: ElectiveGroup[];
};

// ── TypeToggle ─────────────────────────────────────────────────────────────

function TypeToggle({
  subjectId, value, onChange, hasOverride,
}: {
  subjectId: string;
  value: "CORE" | "ELECTIVE";
  onChange: (id: string, type: "CORE" | "ELECTIVE") => void;
  hasOverride: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(subjectId, "CORE")}
        className={`text-xs font-medium rounded-l-md border px-3 py-1.5 transition-colors ${
          value === "CORE"
            ? "bg-teal text-white border-teal"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}>
        Core
      </button>
      <button type="button" onClick={() => onChange(subjectId, "ELECTIVE")}
        className={`text-xs font-medium rounded-r-md border-t border-b border-r px-3 py-1.5 transition-colors ${
          value === "ELECTIVE"
            ? "bg-amber-500 text-white border-amber-500"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}>
        Elective
      </button>
      {hasOverride && (
        <span className="ml-1 text-xs text-teal" title="Overrides the subject's default type">*</span>
      )}
    </div>
  );
}

// ── ElectiveGroupsReadView ─────────────────────────────────────────────────
// Read-through view of groups from timetable requirements. Teacher assignment
// happens here: each subject row can have one or more teachers, each
// representing a distinct sub-group of students.

function ElectiveGroupsReadView({
  groups,
  allTeachers,
  onAddTeacher,
  onRemoveTeacher,
  teacherMutating,
  formNum,
}: {
  groups: ElectiveGroup[];
  allTeachers: StaffTeacher[];
  onAddTeacher: (groupId: string, subjectId: string, teacherId: string) => Promise<void>;
  onRemoveTeacher: (groupId: string, subjectId: string, teacherId: string) => Promise<void>;
  teacherMutating: Record<string, boolean>;
  formNum: number;
}) {
  const [pickerState, setPickerState] = useState<{
    groupId: string; subjectId: string;
  } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerState(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-5 py-6 text-center mb-6">
        <Layers className="h-8 w-8 text-violet-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-violet-700">No elective groups for Form {formNum} yet.</p>
        <p className="text-xs text-violet-500 mt-1 max-w-sm mx-auto">
          Elective groups are defined in{" "}
          <Link href="/principal/timetable/requirements"
            className="underline hover:text-violet-700 inline-flex items-center gap-0.5">
            Timetable → Requirements <ExternalLink className="h-3 w-3" />
          </Link>.
          Once created they appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-ink">Elective Groups</span>
        <Chip variant="purple" size="xs">{groups.length}</Chip>
        <Link href="/principal/timetable/requirements"
          className="ml-auto text-xs text-violet-600 hover:underline flex items-center gap-1">
          Manage in Requirements <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {groups.map((group) => {
        const streamLabel = group.scopeStreams.length > 0
          ? group.scopeStreams.join(", ")
          : "all streams";

        return (
          <div key={group.id} className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50/60 border-b border-violet-100">
              <Layers className="h-3.5 w-3.5 text-violet-500 shrink-0" />
              <span className="text-sm font-semibold text-ink flex-1">{group.name}</span>
              <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                {group.lessonsPerWeek}/wk
              </span>
              {group.scopeForm > 0 && (
                <span className="text-[10px] text-slate/60 shrink-0">
                  Form {group.scopeForm} · {streamLabel}
                </span>
              )}
            </div>

            {/* Subjects inside the group */}
            <div className="divide-y divide-violet-100">
              {group.members.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate/50 italic">
                  No subjects in this group yet — add them in Timetable Requirements.
                </p>
              )}
              {group.members.map((member) => {
                const subjectTeachers = group.teachers.filter(
                  (t) => t.subjectId === member.subjectId,
                );
                const isPicking =
                  pickerState?.groupId === group.id &&
                  pickerState?.subjectId === member.subjectId;
                const mutKey = `${group.id}:${member.subjectId}`;
                const isMutating = teacherMutating[mutKey] ?? false;

                // Teachers eligible to add: assigned to this subject, not already in this slot
                const alreadyAssigned = new Set(subjectTeachers.map((t) => t.teacherId));
                const eligible = allTeachers.filter(
                  (t) =>
                    t.teacherSubjects.some((ts) => ts.subject.id === member.subjectId) &&
                    !alreadyAssigned.has(t.id),
                );
                const filtered = eligible.filter(
                  (t) =>
                    pickerQuery === "" ||
                    t.fullName.toLowerCase().includes(pickerQuery.toLowerCase()),
                );

                return (
                  <div key={member.subjectId} className="px-4 py-3">
                    {/* Subject name + code */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-ink flex-1">
                        {member.subject.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate bg-line px-1.5 py-0.5 rounded">
                        {member.subject.code}
                      </span>
                    </div>

                    {/* Teacher rows — one per sub-group */}
                    <div className="space-y-1.5 mb-2">
                      {subjectTeachers.length === 0 && (
                        <p className="text-xs text-slate/50 italic">No teacher assigned yet.</p>
                      )}
                      {subjectTeachers.map((t) => (
                        <div key={t.id}
                          className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-1.5">
                          <User className="h-3 w-3 text-teal shrink-0" />
                          <span className="text-xs text-ink flex-1">{t.teacher.fullName}</span>
                          <button type="button"
                            disabled={isMutating}
                            onClick={() => onRemoveTeacher(group.id, member.subjectId, t.teacherId)}
                            className="p-0.5 rounded hover:bg-red-50 text-slate/40 hover:text-red-500 transition-colors"
                            title="Remove this teacher from the group subject">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add teacher picker */}
                    <div className="relative" ref={isPicking ? pickerRef : undefined}>
                      <button type="button"
                        disabled={isMutating || eligible.length === 0}
                        onClick={() => {
                          setPickerQuery("");
                          setPickerState(isPicking ? null : { groupId: group.id, subjectId: member.subjectId });
                        }}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors
                          ${isPicking
                            ? "bg-violet-100 border-violet-400 text-violet-800"
                            : "bg-white border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400"
                          } disabled:opacity-40 disabled:cursor-not-allowed`}>
                        <Plus className="h-3 w-3" />
                        {eligible.length === 0 ? "No eligible teachers" : "Add teacher"}
                      </button>

                      {isPicking && (
                        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-line rounded-xl shadow-lg w-56 overflow-hidden">
                          <div className="p-2 border-b border-line">
                            <input autoFocus type="text" placeholder="Search teachers…"
                              value={pickerQuery}
                              onChange={(e) => setPickerQuery(e.target.value)}
                              className={`${inputClass} text-xs py-1 w-full`} />
                          </div>
                          <div className="max-h-44 overflow-y-auto divide-y divide-line">
                            {filtered.length === 0 ? (
                              <p className="px-3 py-3 text-xs text-slate/60 text-center">
                                {eligible.length === 0 ? "No eligible teachers" : "No matches"}
                              </p>
                            ) : (
                              filtered.map((t) => (
                                <button key={t.id} type="button"
                                  onClick={async () => {
                                    setPickerState(null);
                                    await onAddTeacher(group.id, member.subjectId, t.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-50 transition-colors">
                                  <span className="text-xs text-ink flex-1">{t.fullName}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FormClassProfilePage({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const { form: formParam } = use(params);
  const router = useRouter();

  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, "CORE" | "ELECTIVE">>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Teacher mutation — tracks in-flight add/remove per (groupId:subjectId)
  const [teacherMutating, setTeacherMutating] = useState<Record<string, boolean>>({});
  const [teacherError, setTeacherError] = useState<string | null>(null);

  // All staff (for teacher picker)
  const [allTeachers, setAllTeachers] = useState<StaffTeacher[]>([]);

  // Filter state
  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState<"" | "CORE" | "ELECTIVE">("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [profileRes, staffRes] = await Promise.all([
        fetch(`/api/class-profiles/form/${formParam}`),
        fetch("/api/staff"),
      ]);
      if (!profileRes.ok) {
        const body = await profileRes.json().catch(() => ({}));
        setLoadError(body.error ?? "Failed to load form profile.");
        return;
      }
      const fresh: FormData = await profileRes.json();
      setData(fresh);
      const init: Record<string, "CORE" | "ELECTIVE"> = {};
      for (const s of fresh.subjects) init[s.id] = s.effectiveType;
      setAssignments(init);
      setDirty(false);

      if (staffRes.ok) {
        const staffData: StaffTeacher[] = await staffRes.json();
        setAllTeachers(staffData.filter((t) => t.teacherSubjects.length > 0));
      }
    } catch {
      setLoadError("Could not load form profile.");
    }
  }, [formParam]);

  useEffect(() => { load(); }, [load]);

  function handleTypeChange(subjectId: string, type: "CORE" | "ELECTIVE") {
    setAssignments((prev) => ({ ...prev, [subjectId]: type }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true); setSaveError(null); setSaved(false);
    const toSend = data.subjects
      .filter((s) => {
        const chosen = assignments[s.id] ?? s.effectiveType;
        return chosen !== s.globalType || s.mixed || Object.keys(s.classOverrides).length > 0;
      })
      .map((s) => ({ subjectId: s.id, type: assignments[s.id] ?? s.effectiveType }));

    if (toSend.length === 0) { setDirty(false); setSaved(true); setSaving(false); return; }

    const res = await fetch(`/api/class-profiles/form/${formParam}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: toSend }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Couldn't save. Please try again.");
    } else {
      setDirty(false); setSaved(true);
      load();
    }
    setSaving(false);
  }

  async function handleAddTeacher(groupId: string, subjectId: string, teacherId: string) {
    const key = `${groupId}:${subjectId}`;
    setTeacherMutating((p) => ({ ...p, [key]: true }));
    setTeacherError(null);
    try {
      const res = await fetch(`/api/timetable/elective-groups/${groupId}/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, teacherId }),
      });
      const body = await res.json();
      if (!res.ok) { setTeacherError(body.error ?? "Failed to add teacher."); return; }
      // Patch local state without a full reload
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          electiveGroups: prev.electiveGroups.map((g) =>
            g.id !== groupId ? g : { ...g, teachers: [...g.teachers, body.pairing] }
          ),
        };
      });
    } finally {
      setTeacherMutating((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleRemoveTeacher(groupId: string, subjectId: string, teacherId: string) {
    const key = `${groupId}:${subjectId}`;
    setTeacherMutating((p) => ({ ...p, [key]: true }));
    setTeacherError(null);
    try {
      const res = await fetch(`/api/timetable/elective-groups/${groupId}/teachers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, teacherId }),
      });
      if (!res.ok) {
        const body = await res.json();
        setTeacherError(body.error ?? "Failed to remove teacher.");
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          electiveGroups: prev.electiveGroups.map((g) =>
            g.id !== groupId ? g
              : { ...g, teachers: g.teachers.filter((t) => !(t.subjectId === subjectId && t.teacherId === teacherId)) }
          ),
        };
      });
    } finally {
      setTeacherMutating((p) => ({ ...p, [key]: false }));
    }
  }

  // Subjects that belong to any elective group — excluded from the plain table
  const groupedSubjectIds = new Set(
    (data?.electiveGroups ?? []).flatMap((g) => g.members.map((m) => m.subjectId))
  );

  const departments = data
    ? [...new Map(data.subjects.map((s) => [s.department.id, s.department])).values()]
    : [];

  const ungroupedSubjects = (data?.subjects ?? []).filter((s) => !groupedSubjectIds.has(s.id));

  const visibleSubjects = ungroupedSubjects.filter((s) => {
    if (filterDept && s.department.id !== filterDept) return false;
    if (filterType && (assignments[s.id] ?? s.effectiveType) !== filterType) return false;
    return true;
  });

  const coreCount = ungroupedSubjects.filter(
    (s) => (assignments[s.id] ?? s.effectiveType) === "CORE"
  ).length;
  const electiveCount = ungroupedSubjects.filter(
    (s) => (assignments[s.id] ?? s.effectiveType) === "ELECTIVE"
  ).length;

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/departments",    label: "Departments" },
          { href: "/principal/classes",        label: "Classes" },
          { href: "/principal/subjects",       label: "Subjects" },
          { href: "/principal/class-profiles", label: "Class Profiles" },
          { href: "/principal/timetable",      label: "Timetable" },
          { href: "/principal/attendance",     label: "Attendance" },
          { href: "/principal/calendar",       label: "Calendar" },
          { href: "/principal/assessments",    label: "Exams & Analysis" },
        ]}
      />

      <Link href="/principal/class-profiles"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-teal transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />All forms
      </Link>

      {loadError ? (
        <div className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
          {loadError}
        </div>
      ) : data === null ? (
        <SkeletonTable rows={6} cols={4} />
      ) : (
        <>
          <PageHeader
            title={`Form ${data.form} — Subject Profile`}
            description={`Configure core/elective assignments and elective-group teacher pairings for all ${data.classes.length} class${data.classes.length !== 1 ? "es" : ""} in this form.`}
            action={
              <div className="flex items-center gap-2">
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />Saved
                  </span>
                )}
                <button type="button" className={secondaryButtonClass}
                  onClick={() => router.push("/principal/class-profiles")}>
                  Cancel
                </button>
                <button type="button" className={primaryButtonClass}
                  onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            }
          />

          {saveError    && <ErrorBanner message={saveError} />}
          {teacherError && <ErrorBanner message={teacherError} onDismiss={() => setTeacherError(null)} />}

          {/* Classes in this form */}
          <div className="mb-5 flex flex-wrap gap-2">
            {data.classes.map((cls) => (
              <span key={cls.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink shadow-sm">
                <span className="font-medium">{cls.name}</span>
                {cls.stream && <span className="text-slate">· {cls.stream}</span>}
                <span className="text-slate/60">{cls._count.students} students</span>
              </span>
            ))}
          </div>

          {/* ── Elective groups read-through view ─────────────────── */}
          <ElectiveGroupsReadView
            groups={data.electiveGroups}
            allTeachers={allTeachers}
            onAddTeacher={handleAddTeacher}
            onRemoveTeacher={handleRemoveTeacher}
            teacherMutating={teacherMutating}
            formNum={data.form}
          />

          {/* ── Non-grouped subjects ──────────────────────────────── */}
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <Chip variant="success" size="xs">{coreCount} core</Chip>
            <Chip variant="warn"    size="xs">{electiveCount} elective</Chip>
            <span className="text-xs text-slate">{ungroupedSubjects.length} non-grouped subjects</span>
            {ungroupedSubjects.some((s) => s.mixed) && (
              <span className="flex items-center gap-1 text-xs text-warn">
                <AlertCircle className="h-3.5 w-3.5" />
                Some subjects have mixed assignments — saving will unify them.
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
              className="text-sm rounded-lg border border-line px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-teal/30">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "" | "CORE" | "ELECTIVE")}
              className="text-sm rounded-lg border border-line px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-teal/30">
              <option value="">All types</option>
              <option value="CORE">Core</option>
              <option value="ELECTIVE">Elective</option>
            </select>
            {(filterDept || filterType) && (
              <button type="button" className="text-sm text-teal hover:underline"
                onClick={() => { setFilterDept(""); setFilterType(""); }}>
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-slate">
              {visibleSubjects.length} of {ungroupedSubjects.length} subjects
            </span>
          </div>

          {/* Subject table */}
          {ungroupedSubjects.length === 0 ? (
            <EmptyState
              message="All subjects for this form are covered by elective groups."
              action={
                <Link href="/principal/subjects"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal hover:underline">
                  Manage subjects
                </Link>
              }
            />
          ) : visibleSubjects.length === 0 ? (
            <EmptyState message="No subjects match the current filters." />
          ) : (
            <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                      <th className="px-5 py-3.5">Subject</th>
                      <th className="px-5 py-3.5 w-[90px]">Code</th>
                      <th className="px-5 py-3.5 hidden md:table-cell">Department</th>
                      <th className="px-5 py-3.5 w-[80px] hidden sm:table-cell">Default</th>
                      <th className="px-5 py-3.5 w-[200px]">Type for Form {data.form}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSubjects.map((s) => {
                      const currentType = assignments[s.id] ?? s.effectiveType;
                      const hasOverride = currentType !== s.globalType;
                      return (
                        <tr key={s.id}
                          className="border-b border-line last:border-0 hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-ink">{s.name}</span>
                            {s.mixed && (
                              <span className="ml-2 text-xs text-warn"
                                title="Classes in this form currently have different types for this subject">
                                (mixed)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
                              {s.code}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <span className="text-sm text-slate">{s.department.name}</span>
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <Chip variant={s.globalType === "CORE" ? "success" : "warn"} size="xs">
                              {s.globalType === "CORE" ? "Core" : "Elective"}
                            </Chip>
                          </td>
                          <td className="px-5 py-3.5">
                            <TypeToggle subjectId={s.id} value={currentType}
                              onChange={handleTypeChange} hasOverride={hasOverride} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-5 py-3 bg-slate-50/60">
                <p className="text-xs text-slate">
                  <span className="text-teal font-medium">*</span> marks subjects where the
                  form assignment differs from the subject&apos;s school-wide default type.
                  Changes apply to all {data.classes.length} class{data.classes.length !== 1 ? "es" : ""} in Form {data.form}.
                  Subjects inside an elective group are shown above and excluded from this table.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
