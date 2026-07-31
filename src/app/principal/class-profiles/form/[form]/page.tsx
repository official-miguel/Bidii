"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageHeader,
  EmptyState,
  Chip,
  ErrorBanner,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

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

type FormData = {
  form: number;
  classes: ClassInfo[];
  subjects: SubjectRow[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function TypeToggle({
  subjectId,
  value,
  onChange,
  hasOverride,
}: {
  subjectId: string;
  value: "CORE" | "ELECTIVE";
  onChange: (id: string, type: "CORE" | "ELECTIVE") => void;
  hasOverride: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(subjectId, "CORE")}
        className={`text-xs font-medium rounded-l-md border px-3 py-1.5 transition-colors ${
          value === "CORE"
            ? "bg-teal text-white border-teal"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}
      >
        Core
      </button>
      <button
        type="button"
        onClick={() => onChange(subjectId, "ELECTIVE")}
        className={`text-xs font-medium rounded-r-md border-t border-b border-r px-3 py-1.5 transition-colors ${
          value === "ELECTIVE"
            ? "bg-amber-500 text-white border-amber-500"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}
      >
        Elective
      </button>
      {hasOverride && (
        <span
          className="ml-1 text-xs text-teal"
          title="This assignment overrides the subject's default type"
        >
          *
        </span>
      )}
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
  // Local assignment state: subjectId → type
  const [assignments, setAssignments] = useState<Record<string, "CORE" | "ELECTIVE">>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Filter state
  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState<"" | "CORE" | "ELECTIVE">("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/class-profiles/form/${formParam}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error ?? "Failed to load form profile.");
        return;
      }
      const fresh: FormData = await res.json();
      setData(fresh);
      // Initialise local assignment state from effective types
      const init: Record<string, "CORE" | "ELECTIVE"> = {};
      for (const s of fresh.subjects) {
        init[s.id] = s.effectiveType;
      }
      setAssignments(init);
      setDirty(false);
    } catch {
      setLoadError("Could not load form profile.");
    }
  }, [formParam]);

  useEffect(() => {
    load();
  }, [load]);

  function handleTypeChange(subjectId: string, type: "CORE" | "ELECTIVE") {
    setAssignments((prev) => ({ ...prev, [subjectId]: type }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    // Only send assignments that differ from the global default OR already
    // have an override — this keeps the payload minimal.
    const toSend = data.subjects
      .filter((s) => {
        const chosen = assignments[s.id] ?? s.effectiveType;
        // Always include if user changed it OR if there's already a stored override
        return chosen !== s.globalType || s.mixed || Object.keys(s.classOverrides).length > 0;
      })
      .map((s) => ({ subjectId: s.id, type: assignments[s.id] ?? s.effectiveType }));

    // If nothing has overrides and nothing is different, just mark clean
    if (toSend.length === 0) {
      setDirty(false);
      setSaved(true);
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/class-profiles/form/${formParam}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: toSend }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Couldn't save. Please try again.");
    } else {
      setDirty(false);
      setSaved(true);
      // Refresh to sync mixed flags
      load();
    }
    setSaving(false);
  }

  // Derived values
  const departments = data
    ? [...new Map(data.subjects.map((s) => [s.department.id, s.department])).values()]
    : [];

  const visibleSubjects = (data?.subjects ?? []).filter((s) => {
    if (filterDept && s.department.id !== filterDept) return false;
    if (filterType && (assignments[s.id] ?? s.effectiveType) !== filterType) return false;
    return true;
  });

  const coreCount = data
    ? data.subjects.filter((s) => (assignments[s.id] ?? s.effectiveType) === "CORE").length
    : 0;
  const electiveCount = data
    ? data.subjects.filter((s) => (assignments[s.id] ?? s.effectiveType) === "ELECTIVE").length
    : 0;

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

      {/* Back link */}
      <Link
        href="/principal/class-profiles"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-teal transition-colors mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All forms
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
            description={`Set each subject as Core or Elective for all ${data.classes.length} class${data.classes.length !== 1 ? "es" : ""} in this form. Changes apply to every class listed below.`}
            action={
              <div className="flex items-center gap-2">
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => router.push("/principal/class-profiles")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={handleSave}
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            }
          />

          {saveError && <ErrorBanner message={saveError} />}

          {/* Classes in this form */}
          <div className="mb-5 flex flex-wrap gap-2">
            {data.classes.map((cls) => (
              <span
                key={cls.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink shadow-sm"
              >
                <span className="font-medium">{cls.name}</span>
                {cls.stream && <span className="text-slate">· {cls.stream}</span>}
                <span className="text-slate/60">{cls._count.students} students</span>
              </span>
            ))}
          </div>

          {/* Summary chips */}
          <div className="mb-4 flex items-center gap-3">
            <Chip variant="success" size="xs">{coreCount} core</Chip>
            <Chip variant="warn"    size="xs">{electiveCount} elective</Chip>
            <span className="text-xs text-slate">{data.subjects.length} subjects total</span>
            {data.subjects.some((s) => s.mixed) && (
              <span className="flex items-center gap-1 text-xs text-warn">
                <AlertCircle className="h-3.5 w-3.5" />
                Some subjects have mixed assignments across classes — saving will unify them.
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="text-sm rounded-lg border border-line px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "CORE" | "ELECTIVE")}
              className="text-sm rounded-lg border border-line px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              <option value="">All types</option>
              <option value="CORE">Core</option>
              <option value="ELECTIVE">Elective</option>
            </select>

            {(filterDept || filterType) && (
              <button
                type="button"
                className="text-sm text-teal hover:underline"
                onClick={() => { setFilterDept(""); setFilterType(""); }}
              >
                Clear filters
              </button>
            )}

            <span className="ml-auto text-xs text-slate">
              {visibleSubjects.length} of {data.subjects.length} subjects
            </span>
          </div>

          {/* Subject table */}
          {data.subjects.length === 0 ? (
            <EmptyState
              message="No subjects are assigned to this form yet."
              action={
                <Link
                  href="/principal/subjects"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal hover:underline"
                >
                  Go to Subjects to add subjects for this form
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
                        <tr
                          key={s.id}
                          className="border-b border-line last:border-0 hover:bg-slate-50/40 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-ink">{s.name}</span>
                            {s.mixed && (
                              <span
                                className="ml-2 text-xs text-warn"
                                title="Classes in this form currently have different types for this subject"
                              >
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
                            <Chip
                              variant={s.globalType === "CORE" ? "success" : "warn"}
                              size="xs"
                            >
                              {s.globalType === "CORE" ? "Core" : "Elective"}
                            </Chip>
                          </td>
                          <td className="px-5 py-3.5">
                            <TypeToggle
                              subjectId={s.id}
                              value={currentType}
                              onChange={handleTypeChange}
                              hasOverride={hasOverride}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer note */}
              <div className="border-t border-line px-5 py-3 bg-slate-50/60">
                <p className="text-xs text-slate">
                  <span className="text-teal font-medium">*</span> marks subjects where the
                  form assignment differs from the subject&apos;s school-wide default type.
                  Changes apply to all {data.classes.length} class{data.classes.length !== 1 ? "es" : ""} in Form {data.form}.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
