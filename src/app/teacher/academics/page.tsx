import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ContextNavigation, { type ContextNavItem } from "@/components/ContextNavigation";

export default async function TeacherAcademicsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { classTeacherOf: { select: { id: true } } },
  });

  const contextItems: ContextNavItem[] = [
    { href: "/teacher/timetable",  label: "Timetable"       },
    { href: "/teacher/results",    label: "Results Entry"   },
    ...(teacher?.classTeacherOf
      ? [{ href: "/teacher/results/slips", label: "Class Result Slips" }]
      : []),
    ...(teacher?.classTeacherOf
      ? [{ href: "/teacher/attendance", label: "Attendance" }]
      : []),
    { href: "/teacher/assessments", label: "Exams & Analysis" },
    { href: "/teacher/calendar",    label: "Calendar"         },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">Academics</h1>
      <p className="text-slate text-sm mb-6 dark:text-dark-muted">
        Results, attendance, assessments, and the school calendar.
      </p>
      <ContextNavigation items={contextItems} />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {contextItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block bg-card border border-line rounded-xl p-6
                       hover:border-teal/40 hover:shadow-sm transition-all duration-150
                       dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
          >
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              {item.label}
            </h2>
          </a>
        ))}
      </div>
    </div>
  );
}
