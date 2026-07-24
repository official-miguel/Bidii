"use client";

/**
 * Performance-over-time line chart for a student's report card.
 * Shows mean score per period as a line graph, matching the design in the
 * screenshot: labelled x-axis with angled period names, y-axis 0–100, clean
 * light-blue line with dots.
 *
 * Uses Recharts — already installed in the project.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface HistoryPoint {
  label: string;   // e.g. "Form 1 – CAT 1 (2024 Term 1)"
  score: number | null;
}

interface Props {
  points: HistoryPoint[];
  /** Optional baseline score to show as a dashed reference line (e.g. KCPE average). */
  baseline?: number | null;
  baselineLabel?: string;
}

export default function PerformanceLineChart({ points, baseline, baselineLabel }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate">
        No historical data available yet.
      </div>
    );
  }

  // Recharts needs numeric values — map null to undefined so the line breaks.
  const data = points.map((p) => ({
    label: p.label,
    score: p.score ?? undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, bottom: 60, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#64748b" }}
          angle={-40}
          textAnchor="end"
          interval={0}
          height={70}
        />
        <YAxis
          domain={[0, 100]}
          tickCount={6}
          tick={{ fontSize: 10, fill: "#64748b" }}
          width={36}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Score"]}
          labelStyle={{ fontSize: 11 }}
          contentStyle={{ fontSize: 11 }}
        />
        {baseline != null && (
          <ReferenceLine
            y={baseline}
            stroke="#f59e0b"
            strokeDasharray="4 3"
            label={{
              value: baselineLabel ?? `Baseline ${baseline}%`,
              position: "insideTopLeft",
              fontSize: 10,
              fill: "#f59e0b",
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
