import type { ContextNavItem } from "@/components/ContextNavigation";

/**
 * Shared ContextNavigation items for the teacher academics section.
 * No Calendar — calendar lives in the sidebar.
 */
export const TEACHER_ACADEMICS_NAV: ContextNavItem[] = [
  { href: "/teacher/academics/departments", label: "Departments"      },
  { href: "/teacher/academics/classes",     label: "Classes"          },
  { href: "/teacher/academics/subjects",    label: "Subjects"         },
  { href: "/teacher/timetable",             label: "Timetable"        },
  { href: "/teacher/attendance",            label: "Attendance"       },
  { href: "/teacher/assessments",           label: "Exams & Analysis" },
];
