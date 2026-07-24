"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  deadline: string; // ISO date string
  label:    string;
}

export default function CountdownTimer({ deadline, label }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState("");
  const [urgent,    setUrgent]    = useState(false);

  useEffect(() => {
    function calc() {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Overdue"); setUrgent(true); return; }
      const days  = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      if (days > 0) {
        setRemaining(`${days}d ${hours}h`);
        setUrgent(days <= 2);
      } else {
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        setRemaining(`${hours}h ${mins}m`);
        setUrgent(true);
      }
    }
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      urgent
        ? "bg-danger-bg text-danger"
        : "bg-warn-bg text-warn"
    }`}>
      {label}: {remaining}
    </span>
  );
}
