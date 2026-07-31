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
  ExternalLink, XCircle, UserCheck, Pencil, ChevronDown,
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
                <span className="text-sm font-medium text-ink">{cls.subjectTeachers.length}</span>
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

          {/* ── Core subject teachers ── */}
          {(() => {
            const coreTeachers = cls.subjectTeachers.filter(
              ({ subject }) => subject.type === "CORE",
            );
            if (coreTeachers.length === 0) return null;
            return (
              <div className="bg-white border border-line rounded-xl p-5">
                <SectionTitle>
                  <BookOpen className="h-3.5 w-3.5" />
                  Core subject teachers
                </SectionTitle>
                <div className="space-y-2">
                  {coreTeachers.map(({ subject, teacher }) => (
                    <div
                      key={subject.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0"
                    >
                      {/* Subject name + code */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0 text-slate">
                          {subject.code}
                        </span>
                        {onOpenSubject ? (
                          <button
                            type="button"
                            onClick={() => onOpenSubject(subject.id, subject.name)}
                            className="text-sm font-medium text-ink hover:text-teal truncate flex items-center gap-1"
                          >
                            {subject.name}
                            <ExternalLink className="h-3 w-3 shrink-0 text-slate/50" />
                          </button>
                        ) : (
                          <span className="text-sm font-medium text-ink truncate">
                            {subject.name}
                          </span>
                        )}
                      </div>

                      {/* Teacher */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Avatar name={teacher.fullName} size="sm" />
                        {onOpenStaff ? (
                          <button
                            type="button"
                            onClick={() => onOpenStaff(teacher.id, teacher.fullName)}
                            className="text-xs text-teal hover:underline flex items-center gap-0.5"
                          >
                            {teacher.fullName}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate">{teacher.fullName}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Elective subjects ── */}
          {(() => {
            const electiveTeachers = cls.subjectTeachers.filter(
              ({ subject }) => subject.type === "ELECTIVE",
            );
            if (electiveTeachers.length === 0) return null;
            return (
              <div className="bg-white border border-line rounded-xl p-5">
                <SectionTitle>
                  <BookOpen className="h-3.5 w-3.5" />
                  Elective subjects
                </SectionTitle>
                <div className="space-y-2">
                  {electiveTeachers.map(({ subject, teacher }) => (
                    <div
                      key={subject.id}
                      className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {onOpenSubject ? (
                          <button
                            type="button"
                            onClick={() => onOpenSubject(subject.id, subject.name)}
                            className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                          >
                            <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5">
                              {subject.code}
                            </span>
                            {subject.name}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </button>
                        ) : (
                          <span className="text-sm text-ink">
                            <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 mr-1.5">
                              {subject.code}
                            </span>
                            {subject.name}
                          </span>
                        )}
                      </div>
                      {onOpenStaff ? (
                        <button
                          type="button"
                          onClick={() => onOpenStaff(teacher.id, teacher.fullName)}
                          className="text-xs text-teal hover:underline shrink-0 flex items-center gap-0.5"
                        >
                          {teacher.fullName}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate shrink-0">{teacher.fullName}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
