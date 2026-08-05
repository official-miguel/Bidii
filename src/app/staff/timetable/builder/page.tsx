"use client";

/**
 * Staff timetable builder — accessible to ADMIN_STAFF with
 * TIMETABLE.canManage or canConfigure (enforced by layout.tsx).
 *
 * Dynamically imports the principal builder component which is a pure
 * client component with no role guard inside it. The staff-specific
 * ContextNavigation rendered here overrides the nav context.
 */

import dynamic from "next/dynamic";
import ContextNavigation from "@/components/ContextNavigation";
import { getTimetableNav } from "@/lib/timetable/navItems";

const BuilderPage = dynamic(
  () => import("@/app/principal/timetable/builder/page"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-slate p-4 animate-pulse">Loading builder…</p>
    ),
  }
);

export default function StaffTimetableBuilderPage() {
  return (
    <div>
      <ContextNavigation items={getTimetableNav("/staff/timetable")} />
      <BuilderPage />
    </div>
  );
}
