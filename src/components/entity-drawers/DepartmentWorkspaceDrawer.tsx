"use client";

/**
 * DepartmentWorkspaceDrawer
 *
 * Slide-over workspace for a department entity. Displays:
 *  - Department info and head of department
 *  - Staff assigned to the department
 *  - Subjects owned by the department
 *
 * Cross-navigation: clicking a teacher opens StaffProfileDrawer.
 * Clicking a subject opens SubjectWorkspaceDrawer.
 */

import { useEffect, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import { BookOpen, Users, Crown, ExternalLink, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DepartmentDetail {
  id: string;
  name: string;
  headTeacher: { id: string; fullName: string; email: string | null } | null;
  subjects: { id: string; name: string; code: string; type: "CORE" | "ELECTIVE" }[];
  teachers: { id: string; fullName: string; email: string | null; staffId: string }[];
  _count: { subjects: number; teachers: number };
}

interface Props {
  departmentId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenStaff?: (staffId: string, staffName: string) => void;
  onOpenSubject?: (subjectId: string, subjectName: string) => void;
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export default function DepartmentWorkspaceDrawer({
  departmentId,
  open,
  onClose,
  onOpenStaff,
  onOpenSubject,
  basePath = "/principal",
}: Props) {
  const [dept, setDept]       = useState<DepartmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open || !departmentId) return;
    setDept(null); setError(null); setLoading(true);
    fetch(`/api/departments/${departmentId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDept(d);
      })
      .catch((e) => setError(e.message || "Couldn't load department details."))
      .finally(() => setLoading(false));
  }, [open, departmentId]);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={dept?.name ?? "Department workspace"}
      description={
        dept
          ? `${dept._count.teachers} staff · ${dept._count.subjects} subjects`
          : undefined
      }
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

      {dept && !loading && (
        <div className="space-y-5">

          {/* ── Overview ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <h2 className="text-base font-semibold text-ink mb-3">{dept.name}</h2>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <Users className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{dept._count.teachers}</span>
                <span className="text-xs text-slate">staff</span>
              </div>
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <BookOpen className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{dept._count.subjects}</span>
                <span className="text-xs text-slate">subjects</span>
              </div>
            </div>
          </div>

          {/* ── Head of department ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <SectionTitle>
              <Crown className="h-3.5 w-3.5" />
              Head of department
            </SectionTitle>
            {dept.headTeacher ? (
              <div className="flex items-center gap-3">
                <Avatar name={dept.headTeacher.fullName} size="md" />
                <div className="flex-1 min-w-0">
                  {onOpenStaff ? (
                    <button
                      type="button"
                      onClick={() => onOpenStaff(dept.headTeacher!.id, dept.headTeacher!.fullName)}
                      className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                    >
                      {dept.headTeacher.fullName}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <p className="text-sm font-medium text-ink">{dept.headTeacher.fullName}</p>
                  )}
                  {dept.headTeacher.email && (
                    <p className="text-xs text-slate truncate">{dept.headTeacher.email}</p>
                  )}
                </div>
                <Chip variant="teal" size="xs">HOD</Chip>
              </div>
            ) : (
              <p className="text-sm text-slate italic">No head of department assigned.</p>
            )}
          </div>

          {/* ── Staff ── */}
          {dept.teachers.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <SectionTitle>
                <Users className="h-3.5 w-3.5" />
                Staff ({dept._count.teachers})
              </SectionTitle>
              <div className="space-y-2">
                {dept.teachers.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-1 border-b border-line last:border-0">
                    <Avatar name={t.fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      {onOpenStaff ? (
                        <button
                          type="button"
                          onClick={() => onOpenStaff(t.id, t.fullName)}
                          className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                        >
                          {t.fullName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-ink">{t.fullName}</p>
                      )}
                      <p className="text-xs text-slate font-mono">{t.staffId}</p>
                    </div>
                  </div>
                ))}
              </div>
              {dept._count.teachers > dept.teachers.length && (
                <a
                  href={`${basePath}/staff?dept=${dept.id}`}
                  className="block mt-3 text-xs text-center text-teal hover:underline"
                >
                  View all staff →
                </a>
              )}
            </div>
          )}

          {/* ── Subjects ── */}
          {dept.subjects.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <SectionTitle>
                <BookOpen className="h-3.5 w-3.5" />
                Subjects ({dept._count.subjects})
              </SectionTitle>
              <div className="space-y-1.5">
                {dept.subjects.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0">
                        {s.code}
                      </span>
                      {onOpenSubject ? (
                        <button
                          type="button"
                          onClick={() => onOpenSubject(s.id, s.name)}
                          className="text-sm text-teal hover:underline flex items-center gap-1 truncate"
                        >
                          {s.name}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                      ) : (
                        <span className="text-sm text-ink truncate">{s.name}</span>
                      )}
                    </div>
                    <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                      {s.type === "CORE" ? "Core" : "Elective"}
                    </Chip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick links ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <SectionTitle>Quick links</SectionTitle>
            <div className="space-y-2">
              <a href={`${basePath}/departments`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                All departments
              </a>
              <a href={`${basePath}/subjects`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Subject list
              </a>
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
