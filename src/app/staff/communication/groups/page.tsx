"use client";

import { useEffect, useState } from "react";
import CommunicationShell from "@/components/messaging/CommunicationShell";
import GroupManager from "@/components/messaging/GroupManager";

export default function StaffGroupsPage() {
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    fetch("/api/messaging/settings").then((r) => setCanManage(r.ok)).catch(() => {});
  }, []);
  return (
    <CommunicationShell base="/staff/communication" canManage={canManage}>
      <GroupManager canManage={canManage} />
    </CommunicationShell>
  );
}
