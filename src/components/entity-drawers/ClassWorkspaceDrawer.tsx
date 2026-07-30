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

import { useEffect, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import {
  Users, BookOpen, CalendarDays, ClipboardList,
  ExternalLink, XCircle, UserCheck,
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
  const [cls, setCls]     = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

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
            <SectionTitle>
              <UserCheck className="h-3.5 w-3.5" />
              Class teacher
            </SectionTitle>
            {cls.classTeacher ? (
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
