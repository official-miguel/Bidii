"use client";

import { useEffect, useMemo, useState, useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import React from "react";
import Modal from "@/components/Modal";
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  Avatar,
  Chip,
  ActionIconButton,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { useStudentsStore } from "@/lib/stores/studentsStore";
import { useClassesStore }  from "@/lib/stores/classesStore";
import { useStaffStore }    from "@/lib/stores/staffStore";
import { useVirtualizer }   from "@tanstack/react-virtual";
import { SkeletonTable }    from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import { Pencil, ExternalLink, UserPlus, UserMinus } from "lucide-react";
import RemoveStudentDialog, { type RemoveStudentTarget } from "@/components/students/RemoveStudentDialog";
import { useFormDraft } from "@/lib/hooks/useFormDraft";
import ClassWorkspaceDrawer from "@/components/entity-drawers/ClassWorkspaceDrawer";

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SchoolClass = { id: string; name: string; form: number; frameworkType?: "EIGHT_FOUR_FOUR" | "CBC" | "CBE" };
type Subject     = { id: string; name: string; code: string; type: "CORE" | "ELECTIVE"; applicableForms: number[] };
type SchoolPolicy = { genderPolicy: string; boardingType: string; autoAllocateDorms: boolean };
type Student     = {
  id: string;
  fullName: string;
  admissionNumber: string;
  dateOfBirth: string | null;
  gender: string | null;
  boardingStatus: string | null;
  parentName: string | null;
  parentContact: string | null;
  classId: string;
  electiveIds: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIRTUAL_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Framework badge helper
// ---------------------------------------------------------------------------

function FrameworkChip({ type }: { type?: string }) {
  if (!type) return null;
  if (type === "CBE")
    return <Chip variant="purple" size="xs">CBE</Chip>;
  if (type === "CBC")
    return <Chip variant="teal" size="xs">CBC</Chip>;
  return <Chip variant="default" size="xs">8-4-4</Chip>;
}

// ---------------------------------------------------------------------------
// Shared table column header (sticky)
// ---------------------------------------------------------------------------

const TABLE_HEADER = (
  <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
    <th className="px-5 py-3.5 w-[260px]">Student</th>
    <th className="px-5 py-3.5 w-[130px]">Adm. No.</th>
    <th className="px-5 py-3.5 w-[130px]">Class</th>
    <th className="px-5 py-3.5">Electives</th>
    <th className="px-5 py-3.5 w-[96px]" />
  </tr>
);

// ---------------------------------------------------------------------------
// Memoised StudentRow
// ---------------------------------------------------------------------------

type StudentRowProps = {
  s: Student;
  cls: SchoolClass | undefined;
  subjectMap: Map<string, Subject>;
  onEdit: (s: Student) => void;
  onRemove: (s: Student) => void;
  onNavigate: (id: string) => void;
  onOpenClass: (id: string) => void;
};

const StudentRow = React.memo(function StudentRow({
  s,
  cls,
  subjectMap,
  onEdit,
  onRemove,
  onNavigate,
  onOpenClass,
}: StudentRowProps) {
  const electives = s.electiveIds
    .map((id) => subjectMap.get(id)?.code)
    .filter(Boolean) as string[];

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors">
      {/* Student name + avatar */}
      <td className="px-5 py-3.5">
        <button
          className="flex items-center gap-3 text-left group/name"
          onClick={() => onNavigate(s.id)}
          title="View profile & attendance"
        >
          <Avatar name={s.fullName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink group-hover/name:text-teal transition-colors truncate">
              {s.fullName}
            </p>
            {s.parentName && (
              <p className="text-xs text-slate/70 truncate">{s.parentName}</p>
            )}
          </div>
        </button>
      </td>

      {/* Admission number */}
      <td className="px-5 py-3.5">
        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
          {s.admissionNumber}
        </span>
      </td>

      {/* Class + framework badge */}
      <td className="px-5 py-3.5">
        {cls ? (
          <button
            type="button"
            onClick={() => onOpenClass(cls.id)}
            className="flex items-center gap-1.5 group/cls text-left"
          >
            <span className="text-sm text-ink group-hover/cls:text-teal transition-colors">{cls.name}</span>
            <FrameworkChip type={cls.frameworkType} />
          </button>
        ) : (
          <span className="text-sm text-ink">—</span>
        )}
      </td>

      {/* Electives */}
      <td className="px-5 py-3.5">
        {electives.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {electives.map((code) => (
              <Chip key={code} variant="teal" size="xs">{code}</Chip>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate/50">—</span>
        )}
      </td>

      {/* Row actions */}
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionIconButton
            icon={<ExternalLink className="h-4 w-4" />}
            label="View profile"
            onClick={() => onNavigate(s.id)}
          />
          <ActionIconButton
            icon={<Pencil className="h-4 w-4" />}
            label="Edit student"
            onClick={() => onEdit(s)}
          />
          <ActionIconButton
            icon={<UserMinus className="h-4 w-4" />}
            label="Remove student"
            variant="danger"
            onClick={() => onRemove(s)}
          />
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// MobileStudentCard — card layout for mobile (<md)
// ---------------------------------------------------------------------------

type MobileStudentCardProps = {
  s: Student;
  cls: SchoolClass | undefined;
  electives: string[];
  onNavigate: (id: string) => void;
  onEdit: (s: Student) => void;
  onRemove: (s: Student) => void;
  onOpenClass: (id: string) => void;
};

const MobileStudentCard = React.memo(function MobileStudentCard({
  s,
  cls,
  electives,
  onNavigate,
  onEdit,
  onRemove,
  onOpenClass,
}: MobileStudentCardProps) {
  return (
    <div className="rounded-xl border border-line bg-white shadow-xs overflow-hidden">
      {/* Tappable header — navigates to student profile */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left
                   active:bg-teal-50/40 transition-colors"
        onClick={() => onNavigate(s.id)}
      >
        <Avatar name={s.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate leading-tight">{s.fullName}</p>
          {s.parentName && (
            <p className="text-xs text-slate/70 truncate leading-tight mt-0.5">{s.parentName}</p>
          )}
        </div>
        <ExternalLink className="h-4 w-4 text-slate/40 shrink-0" aria-hidden="true" />
      </button>

      {/* Detail fields */}
      <dl className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-2.5
                     border-t border-line/60 pt-3">
        <div>
          <dt className="text-[10px] font-semibold text-slate uppercase tracking-wide mb-0.5">
            Adm. No.
          </dt>
          <dd>
            <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
              {s.admissionNumber}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold text-slate uppercase tracking-wide mb-0.5">
            Class
          </dt>
          <dd className="flex items-center gap-1.5 flex-wrap">
            {cls ? (
              <button
                type="button"
                onClick={() => onOpenClass(cls.id)}
                className="flex items-center gap-1.5 flex-wrap text-left"
              >
                <span className="text-sm text-ink hover:text-teal transition-colors">{cls.name}</span>
                <FrameworkChip type={cls.frameworkType} />
              </button>
            ) : (
              <span className="text-sm text-ink">—</span>
            )}
          </dd>
        </div>
        {electives.length > 0 && (
          <div className="col-span-2">
            <dt className="text-[10px] font-semibold text-slate uppercase tracking-wide mb-1">
              Electives
            </dt>
            <dd className="flex flex-wrap gap-1">
              {electives.map((code) => (
                <Chip key={code} variant="teal" size="xs">{code}</Chip>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {/* Action row */}
      <div className="px-4 pb-4 pt-2 flex items-center gap-2
                      border-t border-line/60">
        <button
          type="button"
          onClick={() => onEdit(s)}
          aria-label="Edit student"
          className="flex-1 flex items-center justify-center gap-2 min-h-[44px]
                     rounded-lg border border-line bg-white text-sm font-medium
                     text-slate hover:bg-teal-50 hover:text-teal hover:border-teal/40
                     transition-colors"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onRemove(s)}
          aria-label="Remove student"
          className="flex-1 flex items-center justify-center gap-2 min-h-[44px]
                     rounded-lg border border-danger/20 bg-danger-bg/30 text-sm font-medium
                     text-danger hover:bg-danger-bg hover:border-danger/40
                     transition-colors"
        >
          <UserMinus className="h-4 w-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function StudentsPage() {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);

  // ── Store reads ───────────────────────────────────────────────────────────
  const rawStudents  = useStudentsStore((s) => s.students);
  const storeLoading = useStudentsStore((s) => s.loading);
  const rawClasses   = useClassesStore((s)  => s.classes);
  const rawSubjects  = useStaffStore((s)    => s.subjects);

  // ── Bootstrap stores on mount (if not already loaded) ───────────────────
  useEffect(() => {
    const s = useStudentsStore.getState();
    const c = useClassesStore.getState();
    if (s.students.length === 0 && !s.loading) s.fetch().catch(console.error);
    if (c.classes.length === 0 && !c.loading) c.fetch().catch(console.error);
  }, []);

  const [fetchedSubjects, setFetchedSubjects] = useState<Subject[]>([]);
  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then(setFetchedSubjects)
      .catch(() => {});
  }, []);

  const subjects: Subject[] = fetchedSubjects.length > 0
    ? fetchedSubjects
    : rawSubjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        type: s.type as "CORE" | "ELECTIVE",
        applicableForms: s.applicableForms,
      }));

  // ── Modal state ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Student | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Draft for the "new student" form — only the controlled-state fields
  // (text inputs use defaultValue/FormData and survive within the session).
  // Key is "new" for creates; edit drafts are scoped to student id.
  const newStudentDraftKey = editing ? `bidii_draft_student_${editing.id}` : "bidii_draft_student_new";
  const [studentDraft, setStudentDraft, clearStudentDraft] = useFormDraft(newStudentDraftKey, {
    selectedForm:     "",
    selectedClassId:  "",
    selectedGender:   "",
    selectedBoarding: "",
    selectedElectives: [] as string[],
  });

  const [selectedClassId, setSelectedClassId] = useState(studentDraft.selectedClassId);
  const [selectedForm, setSelectedForm]       = useState(studentDraft.selectedForm);
  const [selectedElectives, setSelectedElectives] = useState<string[]>(studentDraft.selectedElectives);
  const [nextAdmissionNumber, setNextAdmissionNumber] = useState<string | null>(null);
  const [schoolPolicy, setSchoolPolicy] = useState<SchoolPolicy>({
    genderPolicy: "MIXED",
    boardingType: "DAY_AND_BOARDING",
    autoAllocateDorms: false,
  });
  const [selectedGender, setSelectedGender]         = useState(studentDraft.selectedGender);
  const [selectedBoarding, setSelectedBoarding]     = useState(studentDraft.selectedBoarding);

  // Persist controlled modal fields on every change
  useEffect(() => {
    if (!modalOpen) return;
    setStudentDraft({ selectedForm, selectedClassId, selectedGender, selectedBoarding, selectedElectives });
  }, [selectedForm, selectedClassId, selectedGender, selectedBoarding, selectedElectives, modalOpen, setStudentDraft]);

  // Fetch school policy once on mount
  useEffect(() => {
    fetch("/api/school/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d: SchoolPolicy | null) => { if (d) setSchoolPolicy(d); })
      .catch(() => {});
  }, []);

  // ── Search / filter ───────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [filterClassId, setFilterClassId] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 200);

  // ── Derived data ──────────────────────────────────────────────────────────
  const classMap = useMemo(() => new Map(rawClasses.map((c) => [c.id, c])), [rawClasses]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const classes: SchoolClass[] = useMemo(
    () => rawClasses.map((c) => ({
      id: c.id,
      name: c.name,
      form: c.form,
      frameworkType: c.frameworkType as SchoolClass["frameworkType"],
    })),
    [rawClasses]
  );

  const forms = useMemo(
    () => Array.from(new Set(classes.map((c) => c.form))).sort((a, b) => a - b),
    [classes]
  );

  const selectedClass = editing
    ? classes.find((c) => c.id === selectedClassId)
    : classes.find((c) => c.form === Number(selectedForm));

  const availableElectives = useMemo(
    () => subjects.filter(
      (s) => s.type === "ELECTIVE" && selectedClass && s.applicableForms.includes(selectedClass.form)
    ),
    [subjects, selectedClass]
  );

  const students: Student[] = useMemo(
    () => rawStudents
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => !s.archivedAt)
      .map((s: any) => ({
        id:              s.id,
        fullName:        s.fullName,
        admissionNumber: s.admissionNumber,
        dateOfBirth:     s.dateOfBirth,
        gender:          s.gender ?? null,
        boardingStatus:  s.boardingStatus ?? null,
        parentName:      s.parentName,
        parentContact:   s.parentContact,
        classId:         s.classId,
        electiveIds:     (s.electives ?? []).map((e: { subjectId: string }) => e.subjectId),
      })),
    [rawStudents]
  );

  const visibleStudents = useMemo(() => {
    let list = students;
    if (filterClassId) list = list.filter((s) => s.classId === filterClassId);
    if (q) list = list.filter((s) =>
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNumber.toLowerCase().includes(q)
    );
    return list;
  }, [students, filterClassId, q]);

  // ── Virtual scrolling ─────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: visibleStudents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 57,
    overscan: 10,
  });

  const useVirtual = visibleStudents.length > VIRTUAL_THRESHOLD;

  // ── Actions ───────────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditing(null);
    setSelectedClassId("");
    setSelectedForm("");
    setSelectedElectives([]);
    setError(null);
    // Pre-set gender from school policy
    setSelectedGender(
      schoolPolicy.genderPolicy === "BOYS_ONLY" ? "MALE" :
      schoolPolicy.genderPolicy === "GIRLS_ONLY" ? "FEMALE" : ""
    );
    // Pre-set boarding from school policy
    setSelectedBoarding(
      schoolPolicy.boardingType === "BOARDING_ONLY" ? "BOARDING" :
      schoolPolicy.boardingType === "DAY_ONLY" ? "DAY" : ""
    );
    fetch("/api/students/next-admission-number")
      .then((r) => r.json())
      .then((d) => setNextAdmissionNumber(d.nextAdmissionNumber ? String(d.nextAdmissionNumber) : null))
      .catch(() => setNextAdmissionNumber(null));
    setModalOpen(true);
  }, [schoolPolicy]);
  const openEdit = useCallback(async (s: Student) => {
    let electiveIds: string[] = [];
    try {
      const res = await fetch(`/api/students/${s.id}`);
      if (res.ok) {
        const full = await res.json();
        electiveIds = (full.electives ?? []).map((e: { subject: { id: string } }) => e.subject.id);
      }
    } catch {}
    setEditing({ ...s, electiveIds });
    setSelectedClassId(s.classId);
    setSelectedElectives(electiveIds);
    setSelectedGender(s.gender ?? "");
    setSelectedBoarding(s.boardingStatus ?? "");
    setNextAdmissionNumber(null);
    setError(null);
    setModalOpen(true);
  }, []);

  // ── Remove student dialog ─────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<RemoveStudentTarget | null>(null);

  const openRemove = useCallback((s: Student) => {
    const cls = rawClasses.find((c) => c.id === s.classId);
    setRemoveTarget({
      id:              s.id,
      fullName:        s.fullName,
      admissionNumber: s.admissionNumber,
      className:       cls?.name,
    });
  }, [rawClasses]);

  const handleRemoveSuccess = useCallback((_archiveType: "TRANSFER" | "EXPULSION") => {
    setRemoveTarget(null);
    // Refetch students so archived student disappears from the list
    useStudentsStore.getState().fetch().catch(console.error);
  }, []);

  const handleNavigate = useCallback((id: string) => {
    router.push(`/principal/students/${id}`);
  }, [router]);

  const [drawerClassId, setDrawerClassId] = useState<string | null>(null);
  const handleOpenClass = useCallback((id: string) => setDrawerClassId(id), []);

  const toggleElective = useCallback((id: string) => {
    setSelectedElectives((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    if (editing) {
      const payload = {
        fullName:           form.get("fullName") as string,
        dateOfBirth:        (form.get("dateOfBirth") as string) || "",
        classId:            selectedClassId,
        gender:             selectedGender || null,
        boardingStatus:     selectedBoarding || null,
        parentName:         (form.get("parentName") as string) || "",
        parentContact:      (form.get("parentContact") as string) || "",
        electiveSubjectIds: selectedElectives,
      };
      const res = await fetch(`/api/students/${editing.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
    } else {
      const payload = {
        fullName:                form.get("fullName") as string,
        startingAdmissionNumber: (form.get("startingAdmissionNumber") as string) || undefined,
        form:                    selectedForm,
        dateOfBirth:             (form.get("dateOfBirth") as string) || "",
        gender:                  selectedGender || null,
        boardingStatus:          selectedBoarding || null,
        parentName:              (form.get("parentName") as string) || "",
        parentContact:           (form.get("parentContact") as string) || "",
        electiveSubjectIds:      selectedElectives,
      };
      if (!payload.form) { setError("Choose a form."); return; }
      const res = await fetch("/api/students", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
    }

    setModalOpen(false);
    clearStudentDraft();
    useStudentsStore.getState().fetch().catch(console.error);
  }, [editing, selectedClassId, selectedElectives, selectedForm, selectedGender, selectedBoarding]);

  // ── Render ────────────────────────────────────────────────────────────────
  const showLoading = storeLoading && students.length === 0;
  const activeFilters = [q, filterClassId].filter(Boolean).length;

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/students", label: "Students" },
          { href: "/principal/staff", label: "Staff" },
        ]}
      />

      <PageHeader
        title="Students"
        description="Admission number is the identifier used across results, marking, and parent linking."
        action={
          <button
            className={primaryButtonClass}
            onClick={openCreate}
            disabled={classes.length === 0}
            title={classes.length === 0 ? "Add a class first" : undefined}
          >
            <UserPlus className="h-4 w-4" />
            Register student
          </button>
        }
      />

      {!showLoading && classes.length === 0 && (
        <div className="mb-4 rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3">
          Create at least one class before registering students.
        </div>
      )}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search by name or admission number…"
        />
        <WorkspaceToolbar.Filter
          label="Filter by class"
          value={filterClassId}
          options={[
            { value: "", label: "All classes" },
            ...classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setFilterClassId}
        />
        {activeFilters > 0 && (
          <button
            type="button"
            className="text-sm text-teal hover:text-teal/80 transition-colors"
            onClick={() => { setSearch(""); setFilterClassId(""); }}
          >
            Clear filters
          </button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount
            count={visibleStudents.length}
            total={students.length}
            label="student"
          />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {/* ── Loading skeleton ── */}
      {showLoading ? (
        <SkeletonTable rows={8} cols={5} hasAvatar />
      ) : visibleStudents.length === 0 ? (
        <EmptyState
          message={q || filterClassId
            ? "No students match your search."
            : "No students registered yet."}
        />
      ) : useVirtual ? (
        /* ── Virtual scrolling for large lists (> 100 rows) — desktop only ── */
        <>
          {/* Mobile card list (no virtualisation — drawer scrolls) */}
          <div className="md:hidden space-y-3">
            {visibleStudents.map((s) => {
              const cls = classMap.get(s.classId) as SchoolClass | undefined;
              const electives = s.electiveIds
                .map((id) => subjectMap.get(id)?.code)
                .filter(Boolean) as string[];
              return (
                <MobileStudentCard
                  key={s.id}
                  s={s}
                  cls={cls}
                  electives={electives}
                  onNavigate={handleNavigate}
                  onEdit={openEdit}
                  onRemove={openRemove}
                  onOpenClass={handleOpenClass}
                />
              );
            })}
          </div>
          {/* Desktop virtual scroll */}
          <div
            ref={parentRef}
            className="hidden md:block bg-white border border-line rounded-xl overflow-auto shadow-sm"
            style={{ height: "65vh" }}
          >
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10">
                {TABLE_HEADER}
              </thead>
            </table>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const s = visibleStudents[virtualItem.index];
                const cls = classMap.get(s.classId) as SchoolClass | undefined;
                return (
                  <div
                    key={s.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                      <tbody>
                        <StudentRow
                          s={s}
                          cls={cls}
                          subjectMap={subjectMap}
                          onEdit={openEdit}
                          onRemove={openRemove}
                          onNavigate={handleNavigate}
                          onOpenClass={handleOpenClass}
                        />
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* ── Standard table (≤ 100 rows) ── */
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {visibleStudents.map((s) => {
              const cls = classMap.get(s.classId) as SchoolClass | undefined;
              const electives = s.electiveIds
                .map((id) => subjectMap.get(id)?.code)
                .filter(Boolean) as string[];
              return (
                <MobileStudentCard
                  key={s.id}
                  s={s}
                  cls={cls}
                  electives={electives}
                  onNavigate={handleNavigate}
                  onEdit={openEdit}
                  onRemove={openRemove}
                  onOpenClass={handleOpenClass}
                />
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-line rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0 z-10">
                  {TABLE_HEADER}
                </thead>
                <tbody>
                  {visibleStudents.map((s) => {
                    const cls = classMap.get(s.classId) as SchoolClass | undefined;
                    return (
                      <StudentRow
                        key={s.id}
                        s={s}
                        cls={cls}
                        subjectMap={subjectMap}
                        onEdit={openEdit}
                        onRemove={openRemove}
                        onNavigate={handleNavigate}
                        onOpenClass={handleOpenClass}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <Modal
          title={editing ? "Edit student" : "Register student"}
          description={
            editing
              ? "Update student information, class placement, and elective subjects."
              : "Add a new student to the school register."
          }
          onClose={() => { setModalOpen(false); clearStudentDraft(); }}
          size="xl"
          footer={
            <div className="flex flex-col-reverse xs:flex-row xs:justify-end gap-2 xs:gap-3">
              <button
                type="button"
                className={`${secondaryButtonClass} w-full xs:w-auto`}
                onClick={() => { setModalOpen(false); clearStudentDraft(); }}
              >
                Cancel
              </button>
              <button type="submit" form="student-form" className={`${primaryButtonClass} w-full xs:w-auto`}>
                {editing ? "Save changes" : "Register student"}
              </button>
            </div>
          }
        >
          <form id="student-form" onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}

            {/* ── Identity ── */}
            <div className="form-section">
              <div className="form-section-title">Identity</div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      Full name <span className="text-danger">*</span>
                    </label>
                    <input
                      name="fullName"
                      required
                      defaultValue={editing?.fullName}
                      className={inputClass}
                      placeholder="e.g. Alice Wanjiku Kamau"
                    />
                  </div>

                  {editing ? (
                    <div>
                      <label className={labelClass}>Admission number</label>
                      <input
                        disabled
                        defaultValue={editing.admissionNumber}
                        className={`${inputClass} bg-paper text-slate cursor-not-allowed`}
                      />
                      <p className="text-xs text-slate mt-1.5">
                        Admission number cannot be changed.
                      </p>
                    </div>
                  ) : students.length === 0 ? (
                    <div>
                      <label className={labelClass}>
                        Starting admission number <span className="text-danger">*</span>
                      </label>
                      <input
                        name="startingAdmissionNumber"
                        type="number"
                        min={1}
                        required
                        className={inputClass}
                        placeholder="e.g. 1000"
                      />
                      <p className="text-xs text-slate mt-1.5">
                        First student — subsequent numbers are assigned automatically.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClass}>Admission number</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={nextAdmissionNumber ?? "…"}
                          readOnly
                          className={`${inputClass} bg-paper cursor-not-allowed pr-28`}
                        />
                        {nextAdmissionNumber && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-success">
                            Auto-assigned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate mt-1.5">
                        Numbers are assigned automatically in sequence.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Date of birth</label>
                    <input
                      name="dateOfBirth"
                      type="date"
                      defaultValue={editing?.dateOfBirth ? editing.dateOfBirth.slice(0, 10) : ""}
                      className={inputClass}
                    />
                    <p className="text-xs text-slate mt-1.5">
                      Used for age-verification and official records.
                    </p>
                  </div>
                  <div /> {/* spacer */}
                </div>

                {/* Gender + Boarding */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Gender */}
                  <div>
                    <label className={labelClass}>Gender</label>
                    {schoolPolicy.genderPolicy !== "MIXED" ? (
                      <>
                        <input
                          readOnly
                          value={schoolPolicy.genderPolicy === "BOYS_ONLY" ? "Male" : "Female"}
                          className={`${inputClass} bg-paper cursor-not-allowed`}
                        />
                        <p className="text-xs text-slate mt-1.5">
                          Fixed by the school gender policy.
                        </p>
                      </>
                    ) : (
                      <select
                        value={selectedGender}
                        onChange={(e) => setSelectedGender(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">— Select —</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    )}
                  </div>

                  {/* Boarding status */}
                  {schoolPolicy.boardingType !== "DAY_ONLY" && (
                    <div>
                      <label className={labelClass}>Boarding status</label>
                      {schoolPolicy.boardingType === "BOARDING_ONLY" ? (
                        <>
                          <input
                            readOnly
                            value="Boarding"
                            className={`${inputClass} bg-paper cursor-not-allowed`}
                          />
                          <p className="text-xs text-slate mt-1.5">
                            All students board — set by school policy.
                          </p>
                        </>
                      ) : (
                        <>
                          <select
                            value={selectedBoarding}
                            onChange={(e) => setSelectedBoarding(e.target.value)}
                            className={inputClass}
                          >
                            <option value="">— Select —</option>
                            <option value="DAY">Day</option>
                            <option value="BOARDING">Boarding</option>
                          </select>
                          {schoolPolicy.autoAllocateDorms && selectedBoarding === "BOARDING" && (
                            <p className="text-xs text-success mt-1.5 font-medium">
                              ✓ Dorm will be auto-assigned on registration.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Class placement ── */}
            <div className="form-section">
              <div className="form-section-title">Class Placement</div>
              <div>
                {editing ? (
                  <>
                    <label className={labelClass}>
                      Class <span className="text-danger">*</span>
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        setSelectedClassId(e.target.value);
                        setSelectedElectives([]);
                      }}
                      className={inputClass}
                    >
                      <option value="" disabled>Select a class…</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className={labelClass}>
                      Form <span className="text-danger">*</span>
                    </label>
                    <select
                      value={selectedForm}
                      onChange={(e) => {
                        setSelectedForm(e.target.value);
                        setSelectedElectives([]);
                      }}
                      className={inputClass}
                    >
                      <option value="" disabled>Select a form…</option>
                      {forms.map((f) => (
                        <option key={f} value={f}>Form {f}</option>
                      ))}
                    </select>
                  </>
                )}

                {/* Framework badge + auto-assign note */}
                {selectedForm && !editing && (() => {
                  const destClass = classes.find((c) => c.form === Number(selectedForm));
                  const fw = destClass?.frameworkType;
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      {fw && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            fw === "CBE"
                              ? "bg-purple-50 text-purple-700"
                              : "bg-teal-50 text-teal-dark"
                          }`}
                        >
                          {fw === "CBE" ? "CBE" : "8-4-4"}
                        </span>
                      )}
                      <span className="text-xs text-slate">
                        Stream is allocated automatically based on capacity.
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Parent / Guardian ── */}
            <div className="form-section">
              <div className="form-section-title">Parent / Guardian</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Guardian name</label>
                  <input
                    name="parentName"
                    defaultValue={editing?.parentName || ""}
                    className={inputClass}
                    placeholder="e.g. John Kamau"
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone number</label>
                  <input
                    name="parentContact"
                    defaultValue={editing?.parentContact || ""}
                    className={inputClass}
                    placeholder="e.g. 0712 345 678"
                  />
                  <p className="text-xs text-slate mt-1.5">
                    Used for SMS and WhatsApp communication.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Elective subjects ── */}
            <div className="form-section">
              <div className="form-section-title">Elective Subjects</div>
              {!selectedClass ? (
                <div className="flex items-center gap-2 rounded-lg bg-paper border border-line px-4 py-3">
                  <svg className="h-4 w-4 text-slate/50 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  <p className="text-sm text-slate">
                    Select a {editing ? "class" : "form"} above to see available elective subjects.
                  </p>
                </div>
              ) : availableElectives.length === 0 ? (
                <p className="text-sm text-slate">
                  No elective subjects are configured for Form {selectedClass.form}.
                </p>
              ) : (
                <div>
                  <p className="text-xs text-slate mb-3">
                    Select the electives this student will take. Deselect to remove.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableElectives.map((s) => {
                      const selected = selectedElectives.includes(s.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => toggleElective(s.id)}
                          className={`inline-flex items-center gap-1.5 text-sm rounded-lg border px-3 py-2.5 sm:py-1.5 font-medium transition-all duration-100 min-h-[44px] sm:min-h-0 ${
                            selected
                              ? "bg-teal text-white border-teal shadow-xs"
                              : "border-line text-ink hover:border-teal/40 hover:bg-teal-50/50"
                          }`}
                        >
                          {selected && (
                            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                            </svg>
                          )}
                          {s.code}
                          <span className="text-xs opacity-70 font-normal">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedElectives.length > 0 && (
                    <p className="text-xs text-teal mt-2.5 font-medium">
                      {selectedElectives.length} elective{selectedElectives.length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* ── Remove Student Dialog ── */}
      {removeTarget && (
        <RemoveStudentDialog
          student={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onSuccess={handleRemoveSuccess}
        />
      )}

      {/* ── Class workspace drawer ── */}
      <ClassWorkspaceDrawer
        classId={drawerClassId}
        open={!!drawerClassId}
        onClose={() => setDrawerClassId(null)}
      />
    </div>
  );
}
