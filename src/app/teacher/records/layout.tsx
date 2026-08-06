import { ShieldAlert, Trophy } from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";

export default function TeacherRecordsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">Student Records</h1>
      <p className="text-slate text-sm mb-5 dark:text-dark-muted">
        Discipline records and student achievements.
      </p>
      <div className="border-b border-line mb-6">
        <ContextNavigation
          items={[
            {
              href: "/teacher/records/discipline",
              label: "Discipline",
              icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
            },
            {
              href: "/teacher/records/achievements",
              label: "Achievements",
              icon: <Trophy className="h-4 w-4" aria-hidden />,
            },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
