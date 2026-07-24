"use client";

import CommunicationShell from "@/components/messaging/CommunicationShell";
import GroupManager from "@/components/messaging/GroupManager";

export default function PrincipalGroupsPage() {
  return (
    <CommunicationShell base="/principal/communication" canManage={true}>
      <GroupManager canManage={true} />
    </CommunicationShell>
  );
}
