"use client";

import { useEffect, useState } from "react";
import { EmptyState, inputClass, labelClass } from "@/components/ui";

type Bucket = { key: string; label: string; meta?: string; present: number; absent: number; rate: number };
type Analytics = {
  from: string;
  to: string;
  recorded: number;
  byForm: Bucket[];
  byStream: Bucket[];
  byStudent: Bucket[];
};

const TABS = [
  { key: "byForm", label: "By Form/Class" },
  { key: "byStream", label: "By Stream" },
  { key: "byStudent", label: "By Student" },
] as const;

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function rateColor(rate: number) {
  if (rate >= 90) return "text-success";
  if (rate >= 75) return "text-warn";
  return "text-danger";
}

/// Principal-only attendance analytics. One fetch per date range; the
/// Form/Stream/Student tabs just switch between the three groupings the API
/// already returned.
export default function AttendanceAnalytics() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("byForm");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/attendance?analytics=1&from=${from}&to=${to}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || "Couldn't load attendance analytics.");
          return;
        }
        setData(body);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Couldn't load attendance analytics.");
      });
    return () => controller.abort();
  }, [from, to]);

  const rows = data ? data[tab] : [];
  const metaHeader = tab === "byStudent" ? "Admission No." : tab === "byStream" ? "Stream" : "";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className={labelClass}>From</label>
          <input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>To</label>
          <input type="date" className={inputClass} value={to} max={isoDaysAgo(0)} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-1 pb-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm border ${
                tab === t.key
                  ? "bg-teal text-white border-teal"
                  : "bg-card text-slate border-line hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : data === null ? (
        <p className="text-sm text-slate">Loading…</p>
      ) : data.recorded === 0 ? (
        <EmptyState message="No attendance recorded in this period yet." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">{tab === "byStudent" ? "Student" : tab === "byStream" ? "Class" : "Form"}</th>
                  {metaHeader && <th className="px-5 py-3.5">{metaHeader}</th>}
                  <th className="px-5 py-3.5 w-[90px]">Present</th>
                  <th className="px-5 py-3.5 w-[90px]">Absent</th>
                  <th className="px-5 py-3.5 w-1/3">Attendance rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.key} className="border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-ink">{b.label}</td>
                    {metaHeader && <td className="px-5 py-3.5 text-slate">{b.meta ?? "—"}</td>}
                    <td className="px-5 py-3.5 text-success font-semibold tabular-nums">{b.present}</td>
                    <td className="px-5 py-3.5 text-danger font-semibold tabular-nums">{b.absent}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${b.rate >= 90 ? "bg-success" : b.rate >= 75 ? "bg-warn" : "bg-danger"}`}
                            style={{ width: `${b.rate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold w-9 text-right tabular-nums ${rateColor(b.rate)}`}>{b.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
