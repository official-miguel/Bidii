/// Section: School Calendar dashboard widgets. Both the Principal and
/// Teacher dashboards show a short "today + upcoming" list — this is the one
/// place that merges real CalendarEvent rows with computed Kenya public
/// holidays (src/lib/kenyaHolidays.ts) for that list, so the two dashboard
/// widgets (and the full calendar page) never drift out of sync on how
/// merging works.

import { prisma } from "./prisma";
import { getKenyaPublicHolidays } from "./kenyaHolidays";

export type UpcomingCalendarItem = {
  id: string;
  title: string;
  date: Date;
  type: string;
  isHoliday: boolean;
};

/// Returns up to `limit` items dated today or later, within the next `days`
/// days, soonest first.
export async function getUpcomingCalendarItems(
  schoolId: string,
  { days = 14, limit = 5 }: { days?: number; limit?: number } = {}
): Promise<UpcomingCalendarItem[]> {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeEnd = new Date(todayUtc.getTime() + days * 24 * 60 * 60 * 1000);

  const dbEvents = await prisma.calendarEvent.findMany({
    where: { schoolId, date: { gte: todayUtc, lt: rangeEnd } },
    orderBy: { date: "asc" },
  });

  // Kenya holidays are computed per calendar year, so a range spanning a
  // year boundary (e.g. looking 14 days ahead from December 28) needs both
  // years' holiday sets.
  const years = new Set([todayUtc.getUTCFullYear(), rangeEnd.getUTCFullYear()]);
  const holidays = Array.from(years)
    .flatMap((y) => getKenyaPublicHolidays(y))
    .filter((h) => h.date >= todayUtc && h.date < rangeEnd);

  const merged: UpcomingCalendarItem[] = [
    ...dbEvents.map((e) => ({ id: e.id, title: e.title, date: e.date, type: e.type as string, isHoliday: false })),
    ...holidays.map((h) => ({ id: h.id, title: h.title, date: h.date, type: "HOLIDAY", isHoliday: true })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return merged.slice(0, limit);
}
