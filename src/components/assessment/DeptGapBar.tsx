"use client";

/**
 * DeptGapBar — bar chart showing dept mean minus school mean per period.
 * Positive bars (dept above school) render in teal; negative in danger red.
 * This is a distinct view from DeptMeanTrend: instead of showing both lines,
 * it answers "by how much and in which direction?" at a glance.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { TrendDataPoint } from "@/app/api/assessments/department/analytics/route";

interface DeptGapBarProps {
  data: TrendDataPoint[];
  deptName: string;
}

function periodLabel(p: TrendDataPoint) {
  return p.term ? `T${p.term} ${p.academicYear}` : p.periodName;
}

// Custom tooltip
function GapTooltip({
  active,
  payload,
  label,
  deptName,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  deptName: string;
}) {
  if (!active || !payload?.length) return null;
  const gap = payload[0].value;
  return (
    <div className="bg-white border border-line rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-ink mb-1">{label}</p>
      <p className={gap >= 0 ? "text-teal font-semibold" : "text-danger font-semibold"}>
        {gap >= 0 ? "+" : ""}
        {gap.toFixed(2)} pts
      </p>
      <p className="text-slate mt-0.5">
        {gap >= 0
          ? `${deptName} is above school avg`
          : `${deptName} is below school avg`}
      </p>
    </div>
  );
}

export default function DeptGapBar({ data, deptName }: DeptGapBarProps) {
  // Only include periods where both values are present
  const chartData = data
    .filter((p) => p.deptMean !== null && p.schoolMean !== null)
    .map((p) => ({
      label: periodLabel(p),
      gap: Math.round((p.deptMean! - p.schoolMean!) * 100) / 100,
    }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
        Not enough data to compute gap yet.
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        Points above or below the school average per period.{" "}
        <span className="text-teal font-medium">Teal = above</span>,{" "}
        <span className="text-danger font-medium">red = below</span>.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
            tick={{ fontSize: 11 }}
          />
          <ReferenceLine y={0} stroke="#667085" strokeWidth={1.5} />
          <Tooltip content={<GapTooltip deptName={deptName} />} />
          <Bar dataKey="gap" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.gap >= 0 ? "#2C7F7E" : "#F04438"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
