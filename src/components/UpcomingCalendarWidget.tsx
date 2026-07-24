import Link from "next/link";
import type { UpcomingCalendarItem } from "@/lib/calendarUpcoming";

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function UpcomingCalendarWidget({
  items,
  calendarHref,
}: {
  items: UpcomingCalendarItem[];
  calendarHref: string;
}) {
  return (
    <div className="bg-card border border-line rounded-xl p-5 shadow-sm dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-ink dark:text-dark-text">Calendar — next 14 days</p>
        <Link href={calendarHref} className="text-xs text-teal hover:text-teal-dark hover:underline transition-colors">
          View calendar
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate dark:text-dark-muted">Nothing on the calendar in the next two weeks.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink truncate dark:text-dark-text">
                {item.title}
                {item.isHoliday && <span className="text-slate dark:text-dark-muted"> · public holiday</span>}
              </span>
              <span className="text-slate text-xs shrink-0 dark:text-dark-muted">{formatShortDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
