import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users, GraduationCap, BookOpen, Home, AlertTriangle,
  Clock, CheckCircle, TrendingUp, Shield, BarChart2, Settings,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import AttendanceStats, { type AttendanceStatsData } from "@/components/AttendanceStats";
import LibraryWidget, { type LibrarySummary } from "@/components/LibraryWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

export default async function PrincipalDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const schoolId = user.schoolId;
  const today    = new Date();
  const todayIso = isoDay(today);

  // ── Single parallel fetch ───────────────────────────────────────────────
  const [
    totalTeachers,
    totalStudents,
    totalClasses,
    totalDepts,
    totalSubjects,
    unresolvedDiscipline,
    pendingAssessments,
    upcomingCalendar,
    attendanceGroups,
    attendanceClasses,
    // Library
    libBooks,
    libBooksOut,
    libCards,
    libStudentsWithFines,
    // Timetable conflicts: classes that have fewer timetable slots than expected
    classesWithTimetable,
    // Accommodation
    dormStats,
  ] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, archivedAt: null } }).catch(() => 0),
    prisma.student.count({ where: { schoolId, archivedAt: null } }).catch(() => 0),
    prisma.schoolClass.count({ where: { schoolId } }).catch(() => 0),
    prisma.department.count({ where: { schoolId } }).catch(() => 0),
    prisma.subject.count({ where: { schoolId } }).catch(() => 0),
    // Unresolved discipline cases
    prisma.disciplineRecord.count({ where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } } }).catch(() => 0),
    // Assessment periods open (marks deadline approaching)
    prisma.assessmentPeriod.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, closingDate: true, openingDate: true },
      take: 5,
    }).catch(() => [] as { id: string; name: string; closingDate?: Date | null; openingDate?: Date | null }[]),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 8 }).catch(() => []),
    // Attendance
    prisma.attendance.groupBy({
      by: ["classId", "status"],
      where: { schoolId, date: today },
      _count: { id: true },
    }).catch(() => [] as { classId: string; status: string; _count: { id: number } }[]),
    prisma.schoolClass.findMany({
      where: { schoolId },
      orderBy: [{ form: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { students: true } } },
    }).catch(() => [] as { id: string; name: string; _count: { students: number } }[]),
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null } }).catch(() => 0),
    prisma.libraryCard.aggregate({
      where: { schoolId },
      _sum: { fineBalance: true, totalFinesPaid: true },
      _count: { id: true },
    }).catch(() => ({ _sum: { fineBalance: null, totalFinesPaid: null }, _count: { id: 0 } })),
    prisma.libraryCard.count({ where: { schoolId, fineBalance: { gt: 0 } } }).catch(() => 0),
    // Classes with at least one timetable slot
    prisma.schoolClass.findMany({
      where: { schoolId },
      select: { id: true, _count: { select: { timetableSlots: true } } },
    }).catch(() => [] as { id: string; _count: { timetableSlots: number } }[]),
    // Dorm summary
    prisma.dormitory.findMany({
      where: { schoolId },
      select: {
        id: true, name: true, totalCapacity: true,
        _count: { select: { beds: true } },
      },
    }).catch(() => [] as { id: string; name: string; totalCapacity: number; _count: { beds: number } }[]),
  ]);

  // ── Attendance payload ──────────────────────────────────────────────────
  type SC = { PRESENT: number; ABSENT: number; recorded: number };
  const countsByClass = new Map<string, SC>();
  for (const row of attendanceGroups) {
    const e = countsByClass.get(row.classId) ?? { PRESENT: 0, ABSENT: 0, recorded: 0 };
    e[row.status as "PRESENT" | "ABSENT"] = row._count.id;
    e.recorded += row._count.id;
    countsByClass.set(row.classId, e);
  }
  const byClass = attendanceClasses.map((c) => {
    const cnt = countsByClass.get(c.id) ?? { PRESENT: 0, ABSENT: 0, recorded: 0 };
    return {
      classId: c.id,
      className: c.name,
      totalStudents: c._count.students,
      present: cnt.PRESENT,
      absent: cnt.ABSENT,
      recorded: cnt.recorded,
    };
  });
  const attendanceData: AttendanceStatsData = {
    date: todayIso,
    totalStudents: byClass.reduce((s, c) => s + c.totalStudents, 0),
    present:  byClass.reduce((s, c) => s + c.present,  0),
    absent:   byClass.reduce((s, c) => s + c.absent,   0),
    recorded: byClass.reduce((s, c) => s + c.recorded, 0),
    byClass,
  };

  // ── Library payload ─────────────────────────────────────────────────────
  const libraryData: LibrarySummary = {
    totalBooks:            libBooks,
    booksCurrentlyOut:     libBooksOut,
    totalFinesOutstanding: Number(libCards._sum.fineBalance ?? 0),
    totalFinesPaid:        Number(libCards._sum.totalFinesPaid ?? 0),
    studentsWithFines:     libStudentsWithFines,
    activeCards:           libCards._count.id,
  };

  // ── Timetable conflict detection ────────────────────────────────────────
  const classesWithoutTimetable = classesWithTimetable.filter((c) => c._count.timetableSlots === 0).length;

  // ── Accommodation stats ─────────────────────────────────────────────────
  const totalBeds     = dormStats.reduce((s, d) => s + d._count.beds, 0);
  const totalCapacity = dormStats.reduce((s, d) => s + (d.totalCapacity ?? 0), 0);
  const occupancy     = totalCapacity > 0 ? Math.round((totalBeds / totalCapacity) * 100) : 0;

  // ── Operational alerts ──────────────────────────────────────────────────
  const alerts: AlertItem[] = [];
  if (unresolvedDiscipline > 0)
    alerts.push({ id: "disc", type: "warn", href: "/principal/records", message: `${unresolvedDiscipline} unresolved discipline case${unresolvedDiscipline !== 1 ? "s" : ""} need attention.` });
  if (classesWithoutTimetable > 0)
    alerts.push({ id: "tt",   type: "danger", href: "/principal/timetable", message: `${classesWithoutTimetable} class${classesWithoutTimetable !== 1 ? "es have" : " has"} no timetable slots assigned.` });
  if (libStudentsWithFines > 0)
    alerts.push({ id: "lib",  type: "info",   href: "/principal/library", message: `${libStudentsWithFines} student${libStudentsWithFines !== 1 ? "s" : ""} with outstanding library fines.` });
  if (attendanceData.recorded < attendanceData.totalStudents * 0.5 && attendanceData.totalStudents > 0)
    alerts.push({ id: "att",  type: "warn",   href: "/principal/attendance", message: "Less than 50% of attendance recorded today. Remind class teachers to submit." });

  const setupIncomplete = totalDepts === 0 || totalSubjects === 0;

  const quickLinks: QuickLink[] = [
    { label: "Add student",       href: "/principal/students/new",    icon: "UserPlus" },
    { label: "Add staff",         href: "/principal/staff/new",       icon: "UserPlus" },
    { label: "Take attendance",   href: "/principal/attendance",      icon: "ClipboardCheck" },
    { label: "Send message",      href: "/principal/communication",   icon: "MessageSquare" },
    { label: "View reports",      href: "/principal/reports",         icon: "BarChart2" },
    { label: "Manage permissions", href: "/principal/staff-roles",   icon: "Shield" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Overview</h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {setupIncomplete && (
        <div className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-ink dark:text-dark-text">
          <p className="font-medium">Finish setting up your school.</p>
          <p className="text-slate mt-0.5 dark:text-dark-muted">Start with departments and subjects — everything else depends on them.</p>
        </div>
      )}

      {/* Operational alerts */}
      <AlertBanner alerts={alerts} />

      {/* Key stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Students"   value={totalStudents}  href="/principal/students"    icon={Users}         color="teal" />
        <StatCard label="Staff"      value={totalTeachers}  href="/principal/staff"        icon={GraduationCap} color="teal" />
        <StatCard label="Classes"    value={totalClasses}   href="/principal/classes"      icon={BookOpen}      color="teal" />
        <StatCard label="Departments" value={totalDepts}    href="/principal/departments"  icon={TrendingUp}    color="teal" />
        <StatCard label="Subjects"   value={totalSubjects}  href="/principal/subjects"     icon={CheckCircle}   color="success" />
        <StatCard
          label="Discipline cases"
          value={unresolvedDiscipline}
          href="/principal/records"
          icon={AlertTriangle}
          color={unresolvedDiscipline > 0 ? "warn" : "success"}
          badge={unresolvedDiscipline > 0 ? `${unresolvedDiscipline} open` : undefined}
          badgeColor="warn"
        />
      </div>

      {/* Accommodation */}
      {dormStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Dormitories"     value={dormStats.length} href="/principal/accommodation" icon={Home}  color="info" />
          <StatCard label="Bed capacity"    value={totalCapacity}    href="/principal/accommodation" icon={Home}  color="info" />
          <StatCard label="Beds allocated"  value={totalBeds}        href="/principal/accommodation" icon={Home}  color={occupancy > 95 ? "warn" : "teal"}
                    badge={`${occupancy}% full`} badgeColor={occupancy > 95 ? "warn" : "success"} />
          <StatCard label="Library fines"  value={`KES ${Number(libCards._sum.fineBalance ?? 0).toLocaleString()}`}
                    href="/principal/library" icon={BookOpen} color={libStudentsWithFines > 0 ? "danger" : "success"}
                    sub={libStudentsWithFines > 0 ? `${libStudentsWithFines} students` : "All cleared"} />
        </div>
      )}

      {/* Assessment deadlines */}
      {pendingAssessments.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Active assessment periods</p>
            <Link href="/principal/assessments" className="text-xs text-teal hover:underline">Manage</Link>
          </div>
          <ul className="space-y-2">
            {pendingAssessments.map((ap) => (
              <li key={ap.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-slate shrink-0" />
                  <span className="text-ink dark:text-dark-text truncate">{ap.name}</span>
                </div>
                {ap.closingDate && (
                  <span className="text-xs text-slate dark:text-dark-muted shrink-0">
                    Closes {new Date(ap.closingDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      <QuickLinkGrid links={quickLinks} title="Quick actions" />

      {/* Attendance today */}
      <div>
        <h2 className="text-base font-semibold text-ink dark:text-dark-text mb-3">Attendance today</h2>
        <AttendanceStats compact initialData={attendanceData} />
      </div>

      {/* Bottom row: calendar + library */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/principal/calendar" />
        <LibraryWidget initialData={libraryData} />
      </div>

      {/* Principal-only links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Staff Roles & Permissions", desc: "Create roles and configure what every staff member can access.", href: "/principal/staff-roles", Icon: Shield },
          { label: "Analytics",                 desc: "School-wide performance trends, subject analysis, and comparisons.", href: "/principal/analytics",   Icon: BarChart2 },
          { label: "System Settings",           desc: "Integration keys, assessment frameworks, and school configuration.", href: "/principal/settings",    Icon: Settings },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block bg-card border border-line rounded-xl p-5 shadow-xs
                       hover:border-teal/40 hover:shadow-sm transition-all
                       dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <card.Icon className="h-4 w-4 text-teal" strokeWidth={2} />
              <p className="text-sm font-semibold text-ink dark:text-dark-text">{card.label}</p>
            </div>
            <p className="text-xs text-slate dark:text-dark-muted">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
