"use client";

import { useRouter, usePathname } from "next/navigation";
import { inputClass, labelClass } from "@/components/ui";

type Period = { id: string; name: string; academicYear: string };
type SchoolClass = { id: string; name: string };

export default function TeacherReportCardsSelector({
  periods,
  classes,
  currentPeriodId,
  currentClassId,
  lockClass,
}: {
  periods: Period[];
  classes: SchoolClass[];
  currentPeriodId: string;
  currentClassId: string;
  lockClass: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(periodId: string, classId: string) {
    const params = new URLSearchParams({ periodId, classId });
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <div>
        <label className={labelClass}>Period</label>
        <select
          className={inputClass}
          value={currentPeriodId}
          onChange={(e) => navigate(e.target.value, currentClassId)}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.academicYear}
            </option>
          ))}
        </select>
      </div>
      {!lockClass && (
        <div>
          <label className={labelClass}>Class</label>
          <select
            className={inputClass}
            value={currentClassId}
            onChange={(e) => navigate(currentPeriodId, e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
