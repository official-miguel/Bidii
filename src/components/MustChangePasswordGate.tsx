"use client";

/**
 * MustChangePasswordGate
 *
 * Thin client wrapper inserted into server layouts.
 * When mustChangePassword is true it renders ForcePasswordChangeModal
 * on top of all children — the children are still mounted (SSR'd) but
 * pointer-events and interaction are blocked by the modal overlay.
 */

import { ReactNode } from "react";
import ForcePasswordChangeModal from "./ForcePasswordChangeModal";

interface Props {
  mustChangePassword: boolean;
  children: ReactNode;
}

export default function MustChangePasswordGate({ mustChangePassword, children }: Props) {
  return (
    <>
      {children}
      <ForcePasswordChangeModal mustChange={mustChangePassword} />
    </>
  );
}
