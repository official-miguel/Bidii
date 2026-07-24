import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ContextNavigation, { type ContextNavItem } from "@/components/ContextNavigation";

const PEOPLE_CONTEXT: ContextNavItem[] = [
  { href: "/principal/students", label: "Students" },
  { href: "/principal/staff", label: "Staff" },
];

export default async function PrincipalPeopleHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">People</h1>
      <p className="text-slate text-sm mb-6 dark:text-dark-muted">
        Students and staff.
      </p>
      <ContextNavigation items={PEOPLE_CONTEXT} />

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="bg-card border border-line rounded-xl p-6
                        hover:border-teal/40 hover:shadow-sm transition-all duration-150
                        dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30">
          <h2 className="text-lg font-semibold text-ink mb-2 dark:text-dark-text">Students</h2>
          <p className="text-slate text-sm mb-4 dark:text-dark-muted">
            Manage student records, enrollment, and class assignments.
          </p>
          <a
            href="/principal/students"
            className="text-teal hover:text-teal-dark font-medium text-sm transition-colors"
          >
            View Students →
          </a>
        </div>

        <div className="bg-card border border-line rounded-xl p-6
                        hover:border-teal/40 hover:shadow-sm transition-all duration-150
                        dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30">
          <h2 className="text-lg font-semibold text-ink mb-2 dark:text-dark-text">Staff</h2>
          <p className="text-slate text-sm mb-4 dark:text-dark-muted">
            Manage teaching staff, departments, and subject assignments.
          </p>
          <a
            href="/principal/staff"
            className="text-teal hover:text-teal-dark font-medium text-sm transition-colors"
          >
            View Staff →
          </a>
        </div>
      </div>
    </div>
  );
}
