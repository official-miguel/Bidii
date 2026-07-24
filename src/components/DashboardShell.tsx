/**
 * DashboardShell — server component.
 *
 * Wraps every role layout with the correct shell (sidebar + top bar) while
 * passing permission-filtered hub visibility down to HubSidebar/MobileDrawer.
 *
 * Usage in any layout:
 *
 *   <DashboardShell role="staff" roleLabel="Librarian" user={user} school={school}>
 *     {children}
 *   </DashboardShell>
 *
 * PRINCIPAL and TEACHER layouts can pass visibleHubs={undefined} to show all hubs.
 * ADMIN_STAFF layouts pass the result of getVisibleHubs(perms).
 */

import HubSidebar from "@/components/HubSidebar";
import TopAppBar  from "@/components/TopAppBar";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import SomaAIProvider from "@/components/SomaAIProvider";
import BackButton from "@/components/BackButton";
import type { NavHub } from "@/lib/permissions";

function initials(email: string, label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

interface DashboardShellProps {
  children:      React.ReactNode;
  role:          string;   // URL prefix: "principal" | "teacher" | "staff" | "parent"
  roleLabel:     string;   // Display: "Principal" | "Head of Department" | …
  userEmail:     string;
  schoolName?:   string;
  /** Hubs this user may see. undefined = all (PRINCIPAL/TEACHER). */
  visibleHubs?:  Set<NavHub>;
  /** Warning shown at the top of content area when the teacher record is unlinked. */
  warnUnlinked?: boolean;
}

export default function DashboardShell({
  children,
  role,
  roleLabel,
  userEmail,
  schoolName,
  visibleHubs,
  warnUnlinked,
}: DashboardShellProps) {
  const userInitials = initials(userEmail, roleLabel);

  return (
    <MobileDrawerProvider>
      <SomaAIProvider role={role} schoolName={schoolName}>
        <div className="min-h-screen bg-paper dark:bg-dark-bg">
          <HubSidebar
            userEmail={userEmail}
            roleLabel={roleLabel}
            role={role}
            schoolName={schoolName}
            visibleHubs={visibleHubs}
          />
          <TopAppBar
            userEmail={userEmail}
            roleLabel={roleLabel}
            userInitials={userInitials}
            schoolName={schoolName}
            role={role}
          />
          <div className="md:pl-16 pt-16 min-h-screen">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:px-10">
              {warnUnlinked && (
                <div className="rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3 mb-6">
                  Your login isn&apos;t linked to a staff record yet. Ask the principal to link your account
                  from the Staff panel.
                </div>
              )}
              <BackButton />
              {children}
            </div>
          </div>
        </div>
      </SomaAIProvider>
    </MobileDrawerProvider>
  );
}
