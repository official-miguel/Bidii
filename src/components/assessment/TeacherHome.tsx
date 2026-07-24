"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeacherClassCard } from "@/app/api/assessments/home/teacher/route";
import { EmptyState } from "@/components/ui";
import { SkeletonCard } from "@/components/ui/ProgressivePage";

interface TeacherHomeData {
  cards: TeacherClassCard[];
  currentPeriod: { id: string; name: string } | null;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-royal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate shrink-0">
        {value}/{max}
      </span>
    </div>
  );
}

export default function TeacherHome() {
  const [data, setData] = useState<TeacherHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments/home/teacher")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load your assignments."));
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} className="h-36" />
        ))}
      </div>
    );
  }

  if (!data.currentPeriod) {
    return (
      <EmptyState message="No active assessment period. Ask the principal to set a current period." />
    );
  }

  if (data.cards.length === 0) {
    return (
      <EmptyState message="You have no class/subject assignments yet. Contact the principal to be assigned." />
    );
  }

  return (
    <div>
      <p className="text-sm text-slate mb-4">
        Active period:{" "}
        <span className="font-medium text-ink">{data.currentPeriod.name}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.cards.map((card) => {
          const done =
            card.totalStudents > 0 &&
            card.enteredCount >= card.totalStudents;

          return (
            <div
              key={`${card.classId}-${card.subjectId}`}
              className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-3 ${
                done ? "border-green-300" : "border-line"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-sm truncate">
                    {card.className}
                  </p>
                  <p className="text-xs text-slate truncate">
                    {card.subjectName}{" "}
                    <span className="text-line">({card.subjectCode})</span>
                  </p>
                </div>
                {done && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    Done
                  </span>
                )}
              </div>

              {/* Progress */}
              <div>
                <p className="text-xs text-slate">Marks entered</p>
                <ProgressBar
                  value={card.enteredCount}
                  max={card.totalStudents}
                />
              </div>

              {/* Action */}
              <Link
                href={`/teacher/assessments/marksheet?classId=${card.classId}&subjectId=${card.subjectId}`}
                className="mt-auto rounded-md bg-royal text-white text-xs font-medium px-3 py-2 text-center hover:bg-royal/90 transition-colors"
              >
                {done ? "Review Marks" : "Enter Marks"}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
