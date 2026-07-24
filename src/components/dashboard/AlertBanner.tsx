import Link from "next/link";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

export interface AlertItem {
  id:      string;
  message: string;
  href?:   string;
  type:    "danger" | "warn" | "info" | "success";
}

const styles = {
  danger:  { bg: "bg-danger-bg border-danger/20", text: "text-danger", Icon: XCircle },
  warn:    { bg: "bg-warn-bg border-warn/20",     text: "text-warn",   Icon: AlertTriangle },
  info:    { bg: "bg-info/8 border-info/20",      text: "text-info",   Icon: Info },
  success: { bg: "bg-success-bg border-success/20", text: "text-success", Icon: CheckCircle },
};

export default function AlertBanner({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const { bg, text, Icon } = styles[a.type];
        const inner = (
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${bg}`}>
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${text}`} strokeWidth={2} />
            <p className={`text-sm ${text}`}>{a.message}</p>
          </div>
        );
        return a.href
          ? <Link key={a.id} href={a.href} className="block hover:opacity-90 transition-opacity">{inner}</Link>
          : <div key={a.id}>{inner}</div>;
      })}
    </div>
  );
}
