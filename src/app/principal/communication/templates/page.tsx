"use client";

import { useRouter } from "next/navigation";
import CommunicationShell from "@/components/messaging/CommunicationShell";
import TemplateList from "@/components/messaging/TemplateList";

interface Template { id: string; name: string; category: string | null; body: string }

export default function PrincipalTemplatesPage() {
  const router = useRouter();

  function handleUse(t: Template) {
    // Navigate to messages tab with template body in query param (simple approach)
    router.push(`/principal/communication?template=${encodeURIComponent(t.body)}`);
  }

  return (
    <CommunicationShell base="/principal/communication" canManage={true}>
      <TemplateList canManage={true} onUse={handleUse} />
    </CommunicationShell>
  );
}
