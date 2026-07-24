import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FileText, Settings } from "lucide-react";

const MODULES = [
  {
    href: "/principal/reports",
    icon: FileText,
    label: "Reports",
    description:
      "Print and export academic reports, report cards, accommodation summaries, attendance records, and student conduct.",
  },
  {
    href: "/principal/settings",
    icon: Settings,
    label: "System Settings",
    description:
      "API integrations, AI configuration, teacher ranking weights, library borrowing rules, and accommodation settings.",
  },
];

export default async function PrincipalAdministrationHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">
        Administration
      </h1>
      <p className="text-slate text-sm mb-8 dark:text-dark-muted">
        Reports and system-wide configuration.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {MODULES.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="group bg-card border border-line rounded-xl p-6
                       hover:border-teal/40 hover:shadow-md transition-all duration-150
                       dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
          >
            <div className="flex items-start gap-4 mb-3">
              <div className="rounded-lg bg-teal/10 p-2.5 shrink-0 group-hover:bg-teal/15 transition-colors">
                <Icon className="h-5 w-5 text-teal" />
              </div>
              <h2 className="text-lg font-semibold text-ink dark:text-dark-text
                             group-hover:text-teal transition-colors pt-1">
                {label}
              </h2>
            </div>
            <p className="text-slate text-sm leading-relaxed dark:text-dark-muted">
              {description}
            </p>
            <div className="mt-4 text-teal text-sm font-medium opacity-0 group-hover:opacity-100
                            transition-opacity">
              Open {label} →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
