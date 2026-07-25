"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CommunicationShell from "@/components/messaging/CommunicationShell";
import TemplateList from "@/components/messaging/TemplateList";

interface Template { id: string; name: string; category: string | null; body: string }

export default function TeacherTemplatesPage() {
  const router = useRouter();
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    fetch("/api/messaging/settings").then((r) => setCanManage(r.ok)).catch(() => {});
  }, []);

  function handleUse(t: Template) {
    router.push(`/teacher/communication?template=${encodeURIComponent(t.body)}`);
  }

  return (
    <CommunicationShell base="/teacher/communication" canManage={canManage}>
      <TemplateList canManage={canManage} onUse={handleUse} />
    </CommunicationShell>
  );
}
