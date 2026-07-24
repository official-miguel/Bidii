"use client";

type Status = "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";

const CONFIG: Record<Status, { label: string; cls: string }> = {
  PENDING:   { label: "Pending",   cls: "bg-slate/10 text-slate" },
  SENT:      { label: "Sent",      cls: "bg-royal/10 text-royal" },
  DELIVERED: { label: "Delivered", cls: "bg-emerald-100 text-emerald-700" },
  FAILED:    { label: "Failed",    cls: "bg-danger-bg text-danger" },
  CANCELLED: { label: "Cancelled", cls: "bg-line text-slate" },
};

export default function DeliveryStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as Status] ?? CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
