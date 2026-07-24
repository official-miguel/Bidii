"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AuditEntry {
  id:          string;
  action:      string;
  performedBy: string;
  targetUser:  string | null;
  staffRoleId: string | null;
  module:      string | null;
  changes:     Record<string, unknown> | null;
  createdAt:   string;
}

const ACTION_COLORS: Record<string, string> = {
  ROLE_CREATED:        "bg-success-bg text-success",
  ROLE_UPDATED:        "bg-info/10 text-info",
  ROLE_DELETED:        "bg-danger-bg text-danger",
  PERMISSION_GRANTED:  "bg-teal-50 text-teal",
  PERMISSION_REVOKED:  "bg-warn-bg text-warn",
  ROLE_ASSIGNED:       "bg-teal-50 text-teal",
  ROLE_UNASSIGNED:     "bg-warn-bg text-warn",
};

export default function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden shadow-xs
                    dark:bg-dark-surface dark:border-dark-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line dark:border-dark-border bg-paper dark:bg-dark-bg">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted w-6" />
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted">Action</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted">Performed by</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted hidden md:table-cell">Target</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted hidden lg:table-cell">Module</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate uppercase tracking-wider dark:text-dark-muted">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <React.Fragment key={entry.id}>
                <tr
                  key={entry.id}
                  onClick={() => entry.changes && toggle(entry.id)}
                  className={`border-b border-line/60 dark:border-dark-border/60 transition-colors
                    ${entry.changes ? "cursor-pointer hover:bg-teal-50/30 dark:hover:bg-teal/5" : ""}`}
                >
                  <td className="px-2 py-3 text-center">
                    {entry.changes && (
                      expanded.has(entry.id)
                        ? <ChevronDown className="h-3.5 w-3.5 text-slate dark:text-dark-muted" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate dark:text-dark-muted" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[entry.action] ?? "bg-line text-slate"}`}>
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink dark:text-dark-text text-xs">{entry.performedBy}</td>
                  <td className="px-4 py-3 text-slate dark:text-dark-muted text-xs hidden md:table-cell">
                    {entry.targetUser ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate dark:text-dark-muted text-xs hidden lg:table-cell">
                    {entry.module ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate dark:text-dark-muted text-xs text-right whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString("en-KE", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                </tr>
                {expanded.has(entry.id) && entry.changes && (
                  <tr key={entry.id + "-exp"} className="bg-paper dark:bg-dark-bg">
                    <td colSpan={6} className="px-6 py-3">
                      <pre className="text-[11px] text-slate dark:text-dark-muted overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(entry.changes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
