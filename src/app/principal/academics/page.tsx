import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ContextNavigation, { type ContextNavItem } from "@/components/ContextNavigation";

const ACADEMICS_CONTEXT: ContextNavItem[] = [
  { href: "/principal/classes", label: "Classes" },
  { href: "/principal/subjects", label: "Subjects" },
  { href: "/principal/timetable", label: "Timetable" },
  { href: "/principal/attendance", label: "Attendance" },
  { href: "/principal/calendar", label: "Calendar" },
  { href: "/principal/assessments", label: "Exams & Analysis" },
];

export default async function PrincipalAcademicsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">Academics</h1>
      <p className="text-slate text-sm mb-6 dark:text-dark-muted">
        Classes, subjects, timetable, attendance, and assessments.
      </p>
      <ContextNavigation items={ACADEMICS_CONTEXT} />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {ACADEMICS_CONTEXT.map((item) => (
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
