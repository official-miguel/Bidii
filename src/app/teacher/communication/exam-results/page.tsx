"use client";

import { useEffect, useState } from "react";
import ExamResultsPanel from "@/components/messaging/ExamResultsPanel";

export default function TeacherExamResultsPage() {
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    fetch("/api/messaging/settings").then((r) => setCanManage(r.ok)).catch(() => {});
  }, []);
  return <ExamResultsPanel canManage={canManage} />;
}
