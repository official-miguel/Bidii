import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AssessmentShell, { type AssessmentNavItem } from "@/components/assessment/AssessmentShell";
import ContextNavigation, { type ContextNavItem } from "@/components/ContextNavigation";

/**
 * Inner layout for /teacher/assessments/**.
 *
 * Renders the "Exams & Analysis" inner sidebar so every sub-page (marksheet,
 * dashboard, dept analytics, staff performance, report cards) is framed
 * inside the same split-pane shell without wrapping the outer teacher layout.
 *
 * Access rules:
 *  - Exam Setup link is NEVER shown to teachers.
 *  - All other links are shown; individual pages do their own access guards.
 */
export default async function TeacherAssessmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  // Resolve the teacher record so we can check if they have a primary dept /
  // are a class teacher (affects which context nav items are shown).
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      primaryDepartmentId: true,
      classTeacherOf: { select: { id: true } },
    },
  });

  const hasDept      = !!teacher?.primaryDepartmentId;
  const isClassTeacher = !!teacher?.classTeacherOf;

  const navItems: AssessmentNavItem[] = [
    { href: "/teacher/assessments",                    label: "Overview",          icon: "🏠", exact: true },
    { href: "/teacher/assessments/marksheet",           label: "Mark Sheets",       icon: "📝" },
    { href: "/teacher/assessments/dashboard",           label: "Dashboard",         icon: "📊" },
    ...(hasDept
      ? [{ href: "/teacher/assessments/dept-analytics", label: "Dept Analytics",    icon: "🏛️" }]
      : []),
    { href: "/teacher/assessments/ranking",             label: "Staff Performance", icon: "🏆" },
    { href: "/teacher/assessments/report-cards",        label: "Report Cards",      icon: "📄" },
  ];

  // Mirror the academics-hub context nav (same items, same order) so the top
  // strip in mobile matches what the teacher sees on every academics page.
  const contextItems: ContextNavItem[] = [
    { href: "/teacher/timetable",   label: "Timetable"     },
    { href: "/teacher/results",     label: "Results Entry" },
    ...(isClassTeacher
      ? [{ href: "/teacher/results/slips", label: "Class Result Slips" }]
      : []),
    ...(isClassTeacher
      ? [{ href: "/teacher/attendance", label: "Attendance" }]
      : []),
    { href: "/teacher/assessments", label: "Exams & Analysis", exact: true },
    { href: "/teacher/calendar",    label: "Calendar"       },
  ];

  const contextNav = <ContextNavigation items={contextItems} />;

  return <AssessmentShell navItems={navItems} contextNav={contextNav}>{children}</AssessmentShell>;
}
