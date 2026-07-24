"use client";

/**
 * StaffProfileDrawer
 *
 * Slide-over workspace that opens when a user clicks any staff member
 * anywhere in the system. Fetches full staff data on open and renders:
 *  - Bio (name, ID, email, phone, login status)
 *  - Role & department
 *  - Subjects taught
 *  - Class teacher assignment (clickable → DepartmentWorkspaceDrawer chain)
 *  - Quick navigation links
 *
 * Cross-navigation props allow the parent to open related entity drawers
 * (e.g. clicking a department chip from within this drawer).
 */

import { useEffect, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import {
  Mail, Phone, BookOpen, Users, Building2,
  ShieldCheck, Shield, ExternalLink, CheckCircle2, XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffDetail {
  id: string;
  fullName: string;
  staffId: string;
  email: string | null;
  phone: string | null;
  todEligible: boolean;
  primaryDepartment: { id: string; name: string } | null;
  classTeacherOf: { id: string; name: string } | null;
  teacherSubjects: { subject: { id: string; name: string; code: string } }[];
  user: {
    email: string;
    isActive: boolean;
    role: string;
    staffRole: { id: string; name: string } | null;
    mustChangePassword: boolean;
  } | null;
}

interface Props {
  staffId: string | null;
  open: boolean;
  onClose: () => void;
  /** Called when user clicks a department chip — lets parent open DeptDrawer */
  onOpenDepartment?: (deptId: string, deptName: string) => void;
  /** Called when user clicks a class name — lets parent open ClassDrawer */
  onOpenClass?: (classId: string, className: string) => void;
  /** Base navigation path, e.g. "/principal" */
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleBadge(staff: StaffDetail): { label: string; variant: "teal" | "info" | "default" } {
  if (!staff.user) return { label: "No login", variant: "default" };
  if (staff.user.role === "PRINCIPAL") return { label: "Principal", variant: "info" };
  if (staff.user.staffRole) return { label: staff.user.staffRole.name, variant: "info" };
  return { label: "Teacher", variant: "teal" };
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-paper border border-line shrink-0 mt-0.5">
        <span className="text-slate">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate uppercase tracking-wide mb-0.5">
          {label}
        </p>
        <div className="text-sm text-ink">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StaffProfileDrawer({
  staffId,
  open,
  onClose,
  onOpenDepartment,
  onOpenClass,
  basePath = "/principal",
}: Props) {
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !staffId) return;
    setStaff(null);
    setError(null);
    setLoading(true);

    fetch(`/api/staff/${staffId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStaff(d);
      })
      .catch((e) => setError(e.message || "Couldn't load staff profile."))
      .finally(() => setLoading(false));
  }, [open, staffId]);

  const { label: roleLabel, variant: roleVariant } = staff ? roleBadge(staff) : { label: "", variant: "default" as const };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={staff?.fullName ?? "Staff profile"}
      description={staff ? `Staff ID: ${staff.staffId}` : undefined}
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

      {staff && !loading && (
        <div className="space-y-5">
          {/* ── Identity card ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-start gap-4 mb-4">
              <Avatar name={staff.fullName} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-ink leading-tight">{staff.fullName}</h2>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Chip variant={roleVariant as "teal" | "info" | "default"} size="xs">
                    {roleVariant === "teal" && <ShieldCheck className="h-3 w-3" />}
                    {roleLabel}
                  </Chip>
                  {staff.todEligible && (
                    <Chip variant="default" size="xs">TOD eligible</Chip>
                  )}
                  {staff.user && (
                    <Chip variant={staff.user.isActive ? "success" : "danger"} size="xs">
                      {staff.user.isActive ? "Active" : "Inactive"}
                    </Chip>
                  )}
                  {staff.user?.mustChangePassword && (
                    <Chip variant="warn" size="xs">Awaiting first login</Chip>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <InfoRow
                icon={<Shield className="h-3.5 w-3.5" />}
                label="Staff ID"
                value={
                  <span className="font-mono text-sm bg-paper border border-line rounded px-1.5 py-0.5">
                    {staff.staffId}
                  </span>
                }
              />

              {staff.email && (
                <InfoRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={
                    <a href={`mailto:${staff.email}`} className="text-teal hover:underline">
                      {staff.email}
                    </a>
                  }
                />
              )}

              {staff.phone && (
                <InfoRow
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={
                    <a href={`tel:${staff.phone}`} className="text-teal hover:underline">
                      {staff.phone}
                    </a>
                  }
                />
              )}

              {staff.primaryDepartment && (
                <InfoRow
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Department"
                  value={
                    onOpenDepartment ? (
                      <button
                        type="button"
                        onClick={() => onOpenDepartment(staff.primaryDepartment!.id, staff.primaryDepartment!.name)}
                        className="inline-flex items-center gap-1 text-teal hover:underline font-medium"
                      >
                        {staff.primaryDepartment.name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span>{staff.primaryDepartment.name}</span>
                    )
                  }
                />
              )}

              {staff.classTeacherOf && (
                <InfoRow
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Class teacher of"
                  value={
                    onOpenClass ? (
                      <button
                        type="button"
                        onClick={() => onOpenClass(staff.classTeacherOf!.id, staff.classTeacherOf!.name)}
                        className="inline-flex items-center gap-1 text-teal hover:underline font-medium"
                      >
                        {staff.classTeacherOf.name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span>{staff.classTeacherOf.name}</span>
                    )
                  }
                />
              )}
            </div>
          </div>

          {/* ── Login status ── */}
          {staff.user && (
            <div className="bg-white border border-line rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
                Login account
              </h3>
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  staff.user.isActive ? "bg-success-bg" : "bg-danger-bg"
                }`}>
                  {staff.user.isActive
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <XCircle     className="h-4 w-4 text-danger" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{staff.user.email}</p>
                  <p className="text-xs text-slate">
                    {staff.user.isActive ? "Active account" : "Account deactivated"}{" "}
                    · {staff.user.role === "PRINCIPAL" ? "Principal" : staff.user.role === "TEACHER" ? "Teacher login" : "Staff login"}
                  </p>
                </div>
              </div>
              {staff.user.mustChangePassword && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-3 py-2">
                  <p className="text-xs text-warn leading-relaxed">
                    This staff member has not yet completed their first login. Their temporary password is still active.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Subjects ── */}
          {staff.teacherSubjects.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Subjects taught
                </div>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {staff.teacherSubjects.map(({ subject }) => (
                  <Chip key={subject.id} variant="teal" size="sm">
                    <span className="font-mono font-bold">{subject.code}</span>
                    <span className="text-teal/70 text-[10px] ml-1">{subject.name}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick links ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
              Quick links
            </h3>
            <div className="space-y-2">
              <a
                href={`${basePath}/staff`}
                className="flex items-center gap-2 text-sm text-teal hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View full staff directory
              </a>
              {staff.classTeacherOf && (
                <a
                  href={`${basePath}/timetable?classId=${staff.classTeacherOf.id}`}
                  className="flex items-center gap-2 text-sm text-teal hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View class timetable
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
