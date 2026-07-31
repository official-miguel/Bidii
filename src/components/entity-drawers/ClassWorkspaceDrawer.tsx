"use client";

/**
 * ClassWorkspaceDrawer
 *
 * Slide-over workspace for a class entity. Displays:
 *  - Class details (name, form, stream, framework, teacher)
 *  - Enrolled students list
 *  - Subjects / teacher assignments
 *  - Quick links to timetable, attendance, assessments
 *
 * Cross-navigation: clicking the class teacher opens StaffProfileDrawer.
 * Clicking a student navigates to their profile page.
 */

import { useEffect, useRef, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import {
  Users, BookOpen, CalendarDays, ClipboardList,
  ExternalLink, XCircle, UserCheck, Pencil, ChevronDown, Layers,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassDetail {
  id: string;
  name: string;
  form: number;
  stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE";
  classTeacher: { id: string; fullName: string; email: string | null } | null;
  students: { id: string; fullName: string; admissionNumber: string }[];
  subjectTeachers: {
    subject: { id: string; name: string; code: string; type: "CORE" | "ELECTIVE" };
    teacher: { id: string; fullName: string };
  }[];
  /** Non-grouped subjects applicable to this class's form */
  allSubjects: {
    id: string;
    name: string;
    code: string;
    type: "CORE" | "ELECTIVE";
    assignedTeacher: { id: string; fullName: string } | null;
  }[];
  /** Qualified teachers per ungrouped subject */
  teachersBySubject: Record<string, { id: string; fullName: string }[]>;
  /** Elective groups that apply to this class — read-through from requirements */
  electiveGroups: {
    id: string;
    name: string;
    scopeForm: number;
    scopeStreams: string[];
    lessonsPerWeek: number;
    members: {
      id: string;
      subjectId: string;
      subject: { id: string; code: string; name: string };
    }[];
    teachers: {
      id: string;
      subjectId: string;
      teacherId: string;
      subject: { id: string; code: string; name: string };
      teacher: { id: string; fullName: string };
    }[];
  }[];
  _count: { students: number };
}

interface StaffOption {
  id: string;
  fullName: string;
  staffId: string;
}

interface Props {
  classId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenStaff?: (staffId: string, staffName: string) => void;
  onOpenSubject?: (subjectId: string, subjectName: string) => void;
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FrameworkBadge({ type }: { type: string }) {
  if (type === "CBE") return <Chip variant="purple" size="xs">CBE</Chip>;
  if (type === "CBC") return <Chip variant="teal"   size="xs">CBC</Chip>;
  return                     <Chip variant="default" size="xs">8-4-4</Chip>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-1.5">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClassWorkspaceDrawer({
  classId,
  open,
  onClose,
  onOpenStaff,
  onOpenSubject,
  basePath = "/principal",
}: Props) {
  const [cls, setCls]         = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Class teacher assign / reassign state
  const [staffOptions, setStaffOptions]             = useState<StaffOption[]>([]);
  const [assigningTeacher, setAssigningTeacher]     = useState(false);
  const [teacherPickerOpen, setTeacherPickerOpen]   = useState(false);
  const [teacherSearch, setTeacherSearch]           = useState("");
  const [teacherSaving, setTeacherSaving]           = useState(false);
  const [teacherError, setTeacherError]             = useState<string | null>(null);
  const teacherPickerRef                            = useRef<HTMLDivElement>(null);

  // Subject-teacher assignment state: which subject is currently open for picker
  const [assigningSubjectId, setAssigningSubjectId] = useState<string | null>(null);
  const [subjectTeacherSearch, setSubjectTeacherSearch] = useState("");
  const [subjectTeacherSaving, setSubjectTeacherSaving] = useState(false);
  const [subjectTeacherError, setSubjectTeacherError]   = useState<string | null>(null);
  const subjectPickerRef                            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !classId) return;
    setCls(null); setError(null); setLoading(true);
    fetch(`/api/classes/${classId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setCls(d);
      })
      .catch((e) => setError(e.message || "Couldn't load class details."))
      .finally(() => setLoading(false));
  }, [open, classId]);

  // Reset picker when drawer closes
  useEffect(() => {
    if (!open) {
      setAssigningTeacher(false);
      setTeacherPickerOpen(false);
      setTeacherSearch("");
      setTeacherError(null);
      setAssigningSubjectId(null);
      setSubjectTeacherSearch("");
      setSubjectTeacherError(null);
    }
  }, [open]);

  // Fetch staff list when entering assign mode
  useEffect(() => {
    if (!assigningTeacher || staffOptions.length > 0) return;
    fetch("/api/staff")
      .then((r) => r.json())
      .then((data: StaffOption[]) => setStaffOptions(data))
      .catch(() => setTeacherError("Couldn't load staff list."));
  }, [assigningTeacher, staffOptions.length]);

  // Close picker on outside click
  useEffect(() => {
    if (!teacherPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (teacherPickerRef.current && !teacherPickerRef.current.contains(e.target as Node)) {
        setTeacherPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [teacherPickerOpen]);

  // Close subject-teacher picker on outside click
  useEffect(() => {
    if (!assigningSubjectId) return;
    function handleClick(e: MouseEvent) {
      if (subjectPickerRef.current && !subjectPickerRef.current.contains(e.target as Node)) {
        setAssigningSubjectId(null);
        setSubjectTeacherSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [assigningSubjectId]);

  async function saveClassTeacher(teacherId: string | null) {
    if (!classId || !cls) return;
    setTeacherSaving(true);
    setTeacherError(null);
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classTeacherId: teacherId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update class teacher.");
      // Refresh the drawer
      const refreshed = await fetch(`/api/classes/${classId}/detail`).then((r) => r.json());
      if (!refreshed.error) setCls(refreshed);
      setAssigningTeacher(false);
      setTeacherSearch("");
    } catch (e) {
      setTeacherError((e as Error).message);
    } finally {
      setTeacherSaving(false);
    }
  }

  const filteredStaff = staffOptions.filter((s) =>
    s.fullName.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    s.staffId.toLowerCase().includes(teacherSearch.toLowerCase())
  );

  /** Assign or reassign the teacher for a subject in this class */
  async function saveSubjectTeacher(subjectId: string, teacherId: string) {
    if (!classId) return;
    setSubjectTeacherSaving(true);
    setSubjectTeacherError(null);
    try {
      const res = await fetch("/api/timetable/class-subject-teachers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, subjectId, teacherId, reassignExistingSlots: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save teacher assignment.");
      // Refresh drawer
      const refreshed = await fetch(`/api/classes/${classId}/detail`).then((r) => r.json());
      if (!refreshed.error) setCls(refreshed);
      setAssigningSubjectId(null);
      setSubjectTeacherSearch("");
    } catch (e) {
      setSubjectTeacherError((e as Error).message);
    } finally {
      setSubjectTeacherSaving(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={cls?.name ?? "Class workspace"}
      description={cls ? `Form ${cls.form}${cls.stream ? ` · ${cls.stream} stream` : ""}` : undefined}
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
          <XCircle className="h-4 w-4 text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {cls && !loading && (
        <div className="space-y-5">

          {/* ── Overview ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{cls.name}</h2>
                <p className="text-sm text-slate mt-0.5">
                  Form {cls.form}{cls.stream ? ` · ${cls.stream} stream` : ""}
                </p>
              </div>
              <FrameworkBadge type={cls.frameworkType} />
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <Users className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{cls._count.students}</span>
                <span className="text-xs text-slate">students</span>
              </div>
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <BookOpen className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{cls.allSubjects?.length ?? cls.subjectTeachers.length}</span>
                <span className="text-xs text-slate">subjects</span>
              </div>
            </div>
          </div>

          {/* ── Class teacher ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>
                <UserCheck className="h-3.5 w-3.5" />
                Class teacher
              </SectionTitle>
              {!assigningTeacher && (
                <button
                  type="button"
                  onClick={() => setAssigningTeacher(true)}
                  className="flex items-center gap-1 text-xs text-teal hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  {cls.classTeacher ? "Reassign" : "Assign"}
                </button>
              )}
            </div>

            {/* Current class teacher display */}
            {!assigningTeacher && (
              cls.classTeacher ? (
                <div className="flex items-center gap-3">
                  <Avatar name={cls.classTeacher.fullName} size="md" />
                  <div className="flex-1 min-w-0">
                    {onOpenStaff ? (
                      <button
                        type="button"
                        onClick={() => onOpenStaff(cls.classTeacher!.id, cls.classTeacher!.fullName)}
                        className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                      >
                        {cls.classTeacher.fullName}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <p className="text-sm font-medium text-ink">{cls.classTeacher.fullName}</p>
                    )}
                    {cls.classTeacher.email && (
                      <p className="text-xs text-slate truncate">{cls.classTeacher.email}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate italic">No class teacher assigned yet.</p>
              )
            )}

            {/* Assign / reassign picker */}
            {assigningTeacher && (
              <div className="space-y-3">
                <div className="relative" ref={teacherPickerRef}>
                  <button
                    type="button"
                    onClick={() => setTeacherPickerOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink hover:border-teal transition-colors"
                  >
                    <span className="truncate">
                      {teacherSearch || "Search staff…"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate shrink-0" />
                  </button>
                  {teacherPickerOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-line">
                        <input
                          autoFocus
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          placeholder="Search by name or staff ID…"
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-teal"
                        />
                      </div>
                      <ul className="max-h-48 overflow-y-auto">
                        {filteredStaff.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate italic">No staff found.</li>
                        ) : (
                          filteredStaff.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setTeacherSearch(s.fullName);
                                  setTeacherPickerOpen(false);
                                  saveClassTeacher(s.id);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-paper transition-colors"
                              >
                                <Avatar name={s.fullName} size="sm" />
                                <span className="flex-1 font-medium text-ink truncate">{s.fullName}</span>
                                <span className="text-xs text-slate font-mono shrink-0">{s.staffId}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                      {cls.classTeacher && (
                        <div className="border-t border-line p-2">
                          <button
                            type="button"
                            onClick={() => { setTeacherPickerOpen(false); saveClassTeacher(null); }}
                            className="w-full text-xs text-danger hover:underline py-1"
                          >
                            Remove class teacher assignment
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {teacherSaving && (
                  <div className="flex items-center gap-2 text-sm text-slate">
                    <Spinner size="sm" /> Saving…
                  </div>
                )}
                {teacherError && (
                  <p className="text-xs text-danger">{teacherError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAssigningTeacher(false); setTeacherSearch(""); setTeacherError(null); }}
                    className="text-xs text-slate hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Subject teachers ── */}
          {(() => {
            const subjects = cls.allSubjects ?? [];
            const coreSubjects     = subjects.filter((s) => s.type === "CORE");
            const ungroupedElectives = subjects.filter((s) => s.type === "ELECTIVE");

            const renderSubjectRow = (s: ClassDetail["allSubjects"][0]) => {
              const qualifiedTeachers = (cls.teachersBySubject?.[s.id] ?? []).filter(
                (t) =>
                  assigningSubjectId !== s.id ||
                  subjectTeacherSearch === "" ||
                  t.fullName.toLowerCase().includes(subjectTeacherSearch.toLowerCase())
              );
              const isOpen = assigningSubjectId === s.id;

              return (
                <div key={s.id} className="py-2.5 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0 text-slate">
                        {s.code}
                      </span>
                      {onOpenSubject ? (
                        <button type="button" onClick={() => onOpenSubject(s.id, s.name)}
                          className="text-sm font-medium text-ink hover:text-teal truncate flex items-center gap-1">
                          {s.name}<ExternalLink className="h-3 w-3 shrink-0 text-slate/40" />
                        </button>
                      ) : (
                        <span className="text-sm font-medium text-ink truncate">{s.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.assignedTeacher ? (
                        <>
                          {onOpenStaff ? (
                            <button type="button"
                              onClick={() => onOpenStaff(s.assignedTeacher!.id, s.assignedTeacher!.fullName)}
                              className="text-xs text-teal hover:underline flex items-center gap-0.5">
                              {s.assignedTeacher.fullName}<ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate">{s.assignedTeacher.fullName}</span>
                          )}
                          <button type="button" title="Change teacher"
                            onClick={() => { setAssigningSubjectId(isOpen ? null : s.id); setSubjectTeacherSearch(""); setSubjectTeacherError(null); }}
                            className="p-1 rounded hover:bg-paper text-slate/40 hover:text-teal transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <button type="button"
                          onClick={() => { setAssigningSubjectId(isOpen ? null : s.id); setSubjectTeacherSearch(""); setSubjectTeacherError(null); }}
                          className="flex items-center gap-1 text-xs font-medium text-teal hover:underline">
                          <UserCheck className="h-3 w-3" />Assign
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-2" ref={subjectPickerRef}>
                      <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
                        <div className="p-2 border-b border-line">
                          <input autoFocus type="text"
                            placeholder={`Search teachers for ${s.name}…`}
                            value={subjectTeacherSearch}
                            onChange={(e) => setSubjectTeacherSearch(e.target.value)}
                            className="w-full text-sm px-2 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-teal" />
                        </div>
                        <ul className="max-h-44 overflow-y-auto">
                          {qualifiedTeachers.length === 0 ? (
                            <li className="px-3 py-3 text-xs text-slate italic text-center">
                              {(cls.teachersBySubject?.[s.id] ?? []).length === 0
                                ? `No teachers teach ${s.name} yet.`
                                : "No matching teachers."}
                            </li>
                          ) : (
                            qualifiedTeachers.map((t) => (
                              <li key={t.id}>
                                <button type="button"
                                  onClick={() => saveSubjectTeacher(s.id, t.id)}
                                  disabled={subjectTeacherSaving}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-paper transition-colors disabled:opacity-50">
                                  <Avatar name={t.fullName} size="sm" />
                                  <span className="flex-1 font-medium text-ink truncate">{t.fullName}</span>
                                  {s.assignedTeacher?.id === t.id && (
                                    <span className="text-[10px] bg-teal/10 text-teal px-1.5 py-0.5 rounded-full font-medium">current</span>
                                  )}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                        {subjectTeacherError && (
                          <p className="px-3 py-2 text-xs text-danger border-t border-line">{subjectTeacherError}</p>
                        )}
                        {subjectTeacherSaving && (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate border-t border-line">
                            <Spinner size="sm" /> Saving…
                          </div>
                        )}
                        <div className="border-t border-line px-3 py-1.5">
                          <button type="button"
                            onClick={() => { setAssigningSubjectId(null); setSubjectTeacherSearch(""); setSubjectTeacherError(null); }}
                            className="text-xs text-slate hover:text-ink">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <>
                {/* Core subjects — individual teacher per subject */}
                {coreSubjects.length > 0 && (
                  <div className="bg-white border border-line rounded-xl p-5">
                    <SectionTitle><BookOpen className="h-3.5 w-3.5" />Core subjects</SectionTitle>
                    <div>{coreSubjects.map(renderSubjectRow)}</div>
                  </div>
                )}

                {/* Ungrouped elective subjects */}
                {ungroupedElectives.length > 0 && (
                  <div className="bg-white border border-line rounded-xl p-5">
                    <SectionTitle><BookOpen className="h-3.5 w-3.5" />Elective subjects</SectionTitle>
                    <div>{ungroupedElectives.map(renderSubjectRow)}</div>
                  </div>
                )}

                {/* Elective groups — read-through from timetable requirements */}
                {(cls.electiveGroups ?? []).length > 0 && (
                  <div className="bg-white border border-line rounded-xl p-5">
                    <SectionTitle><Layers className="h-3.5 w-3.5 text-violet-500" />Elective groups</SectionTitle>
                    <div className="space-y-4">
                      {(cls.electiveGroups ?? []).map((group) => (
                        <div key={group.id} className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
                          {/* Group header */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-violet-50/60 border-b border-violet-100">
                            <Layers className="h-3 w-3 text-violet-500 shrink-0" />
                            <span className="text-xs font-semibold text-ink flex-1">{group.name}</span>
                            <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                              {group.lessonsPerWeek}/wk
                            </span>
                          </div>
                          {/* Subjects + teacher pairings */}
                          <div className="divide-y divide-violet-100">
                            {group.members.map((member) => {
                              const pairings = group.teachers.filter(
                                (t) => t.subjectId === member.subjectId
                              );
                              return (
                                <div key={member.subjectId} className="px-3 py-2.5">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-mono text-[10px] bg-paper border border-line rounded px-1 py-0.5 text-slate shrink-0">
                                      {member.subject.code}
                                    </span>
                                    <span className="text-sm font-medium text-ink">{member.subject.name}</span>
                                  </div>
                                  {pairings.length === 0 ? (
                                    <p className="text-xs text-slate/50 italic pl-1">No teacher assigned — set in Timetable Requirements.</p>
                                  ) : (
                                    <div className="space-y-1 pl-1">
                                      {pairings.map((p) => (
                                        <div key={p.id} className="flex items-center gap-1.5">
                                          <UserCheck className="h-3 w-3 text-teal shrink-0" />
                                          {onOpenStaff ? (
                                            <button type="button"
                                              onClick={() => onOpenStaff(p.teacher.id, p.teacher.fullName)}
                                              className="text-xs text-teal hover:underline flex items-center gap-0.5">
                                              {p.teacher.fullName}<ExternalLink className="h-2.5 w-2.5" />
                                            </button>
                                          ) : (
                                            <span className="text-xs text-slate">{p.teacher.fullName}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-slate/50 flex items-center gap-1">
                      Teacher assignments for elective groups are managed in
                      <a href={`${basePath}/timetable/requirements`} className="text-violet-600 hover:underline flex items-center gap-0.5">
                        Timetable → Requirements <ExternalLink className="h-2.5 w-2.5" />
                      </a>.
                    </p>
                  </div>
                )}
              </>
            );
          })()}

          {/* ── Students ── */}
          {cls.students.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <SectionTitle>
                <Users className="h-3.5 w-3.5" />
                Students ({cls._count.students})
              </SectionTitle>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {cls.students.map((s) => (
                  <a
                    key={s.id}
                    href={`${basePath}/students/${s.id}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-paper transition-colors group"
                  >
                    <Avatar name={s.fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink group-hover:text-teal transition-colors truncate">
                        {s.fullName}
                      </p>
                      <p className="text-xs text-slate font-mono">{s.admissionNumber}</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate/40 group-hover:text-teal transition-colors shrink-0" />
                  </a>
                ))}
              </div>
              {cls._count.students > cls.students.length && (
                <a
                  href={`${basePath}/students?classId=${cls.id}`}
                  className="block mt-3 text-xs text-center text-teal hover:underline"
                >
                  View all {cls._count.students} students →
                </a>
              )}
            </div>
          )}

          {/* ── Quick links ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <SectionTitle>Quick links</SectionTitle>
            <div className="space-y-2">
              <a
                href={`${basePath}/timetable?classId=${cls.id}`}
                className="flex items-center gap-2 text-sm text-teal hover:underline"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                View timetable
              </a>
              <a
                href={`${basePath}/attendance?classId=${cls.id}`}
                className="flex items-center gap-2 text-sm text-teal hover:underline"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                View attendance
              </a>
              <a
                href={`${basePath}/students?classId=${cls.id}`}
                className="flex items-center gap-2 text-sm text-teal hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View all students
              </a>
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
