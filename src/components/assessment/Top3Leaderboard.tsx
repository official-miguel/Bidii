"use client";

import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";

interface Top3LeaderboardProps {
  top3: TeacherRankResult[];
}

const MEDALS = ["🥇", "🥈", "🥉"];
const CARD_STYLES = [
  "border-amber-300 bg-amber-50",
  "border-slate-300 bg-slate-50",
  "border-orange-300 bg-orange-50",
];
const ORDER = [1, 0, 2]; // podium: 2nd | 1st | 3rd

export default function Top3Leaderboard({ top3 }: Top3LeaderboardProps) {
  if (top3.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
        No ranking data available for this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-1">
      {/* Podium layout on md+; horizontal scroll on mobile */}
      <div className="flex gap-3 min-w-max md:min-w-0 md:justify-center items-end">
        {ORDER.map((idx) => {
          const entry = top3[idx];
          if (!entry) return null;
          const isFirst = idx === 0;

          return (
            <div
              key={entry.teacherId}
              className={`flex flex-col items-center rounded-xl border-2 px-5 py-4 w-44 shadow-sm
                ${CARD_STYLES[idx]} ${isFirst ? "mb-0" : "mb-2"}`}
            >
              <span className="text-2xl mb-1">{MEDALS[idx]}</span>
              <p className="font-bold text-ink text-sm text-center leading-tight">
                {entry.teacherName}
              </p>
              {entry.subjectName && (
                <p className="text-xs text-slate text-center mt-0.5">{entry.subjectName}</p>
              )}
              <p className="text-xs font-medium text-royal mt-2">
                Score: {(entry.compositeScore * 100).toFixed(1)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
