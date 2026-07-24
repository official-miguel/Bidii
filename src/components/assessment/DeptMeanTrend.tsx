"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TrendDataPoint } from "@/app/api/assessments/department/analytics/route";

interface DeptMeanTrendProps {
  data: TrendDataPoint[];
  deptName: string;
}

function periodLabel(p: TrendDataPoint) {
  return p.term ? `T${p.term} ${p.academicYear}` : p.periodName;
}

export default function DeptMeanTrend({ data, deptName }: DeptMeanTrendProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
        No trend data available yet.
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
        Mean grade points for <span className="font-medium text-ink">{deptName}</span> across
        all assessment periods vs. school average.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[1, 12]} ticks={[1, 3, 5, 7, 9, 11, 12]} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, name: string) => [
              value?.toFixed(2) ?? "—",
              name === "dept" ? deptName : "School average",
            ]}
          />
          <Legend formatter={(v) => (v === "dept" ? deptName : "School average")} />
          <Line
            type="monotone"
            dataKey="dept"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="school"
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
