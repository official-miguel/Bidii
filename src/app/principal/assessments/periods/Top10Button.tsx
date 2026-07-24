"use client";

import { useState } from "react";
import { Trophy, Loader2 } from "lucide-react";

type Result = {
  created: number;
  updated: number;
  totalStudents: number;
  message: string;
};

export default function Top10Button({ periodId }: { periodId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function run() {
    if (state === "loading") return;
    setState("loading");
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/assessments/top10-achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong.");
        setState("error");
      } else {
        setResult(data);
        setState("done");
      }
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1 rounded-md
          ${state === "loading"
            ? "text-slate cursor-not-allowed"
            : state === "done"
              ? "text-success hover:text-success/80"
              : state === "error"
                ? "text-danger hover:text-danger/80"
                : "text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200"
          }`}
        title="Compute rankings and auto-register top-10 students per class and form as Academic Achievements"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Computing…
          </>
        ) : state === "done" ? (
          <>
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            Done ✓
          </>
        ) : state === "error" ? (
          <>⚠ Retry</>
        ) : (
          <>
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            Top 10 Achievements
          </>
        )}
      </button>

      {/* Inline feedback — shown below the button, doesn't shift layout */}
      {state === "done" && result && (
        <p className="text-[11px] text-success leading-tight max-w-[220px]">
          {result.message}
        </p>
      )}
      {state === "error" && errorMsg && (
        <p className="text-[11px] text-danger leading-tight max-w-[220px]">{errorMsg}</p>
      )}
    </div>
  );
}
