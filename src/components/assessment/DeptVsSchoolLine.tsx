"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TrendDataPoint } from "@/app/api/assessments/department/analytics/route";

interface DeptVsSchoolLineProps {
  data: TrendDataPoint[];
  deptName: string;
}

function periodLabel(p: TrendDataPoint) {
  return p.term ? `T${p.term} ${p.academicYear}` : p.periodName;
}

export default function DeptVsSchoolLine({ data, deptName }: DeptVsSchoolLineProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
        No comparison data available yet.
      </div>
    );
  }

  const chartData = data.map((p) => ({
    label: periodLabel(p),
    dept: p.deptMean,
    school: p.schoolMean,
  }));

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        <span className="font-medium text-ink">{deptName}</span> mean (solid) vs.{" "}
        school average (dashed grey) on the same axes.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[1, 12]} ticks={[1, 3, 5, 7, 9, 11, 12]} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, name: string) => [
              value?.toFixed(2) ?? "—",
              name === "dept" ? deptName : "School",
            ]}
          />
          <Legend formatter={(v) => (v === "dept" ? deptName : "School")} />
          <Line
            type="monotone"
            dataKey="dept"
            stroke="#1d4ed8"
            strokeWidth={2.5}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="school"
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
