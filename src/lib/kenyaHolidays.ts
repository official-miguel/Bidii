/// Section: School Calendar — Kenya's national public holidays, computed on
/// the fly for any given year rather than stored/seeded in the database.
/// This is what keeps the calendar correct year to year with no admin upkeep:
/// the calendar API (src/app/api/calendar/events/route.ts) calls
/// `getKenyaPublicHolidays(year)` for whichever year(s) a requested month
/// falls in and merges the result in alongside real `CalendarEvent` rows.
///
/// Coverage: the fixed-date holidays gazetted every year, plus Good Friday
/// and Easter Monday (computed from the date of Easter Sunday). Idd-ul-Fitr
/// and Idd-ul-Adha are deliberately NOT included — they follow the lunar
/// Islamic calendar and are only confirmed by government gazette notice a
/// few days beforehand, so there's no reliable formula for them. A
/// Principal/Staff member with CALENDAR manage access can add those (or any
/// other one-off public holiday) as a normal `CalendarEvent` of type
/// HOLIDAY once gazetted.
///
/// Kenya's "holiday falls on a Sunday -> observed the following Monday"
/// rule is applied to the fixed-date holidays below (Easter dates always
/// fall on their own fixed weekdays, so it doesn't apply to those).

export type KenyaHoliday = {
  /// Stable, deterministic id (not a DB id) so the frontend can key on it
  /// and tell these apart from real CalendarEvent rows.
  id: string;
  title: string;
  date: Date; // midnight UTC of the calendar day
};

const FIXED_HOLIDAYS: { slug: string; title: string; month: number; day: number }[] = [
  { slug: "new-year", title: "New Year's Day", month: 1, day: 1 },
  { slug: "labour-day", title: "Labour Day", month: 5, day: 1 },
  { slug: "madaraka-day", title: "Madaraka Day", month: 6, day: 1 },
  { slug: "mashujaa-day", title: "Mashujaa Day", month: 10, day: 20 },
  { slug: "jamhuri-day", title: "Jamhuri Day", month: 12, day: 12 },
  { slug: "christmas-day", title: "Christmas Day", month: 12, day: 25 },
  { slug: "boxing-day", title: "Boxing Day", month: 12, day: 26 },
];

/// Anonymous Gregorian algorithm (a.k.a. Meeus/Jones/Butcher) for the date
/// of Easter Sunday in a given year. Good Friday and Easter Monday are
/// computed as +/- a few days from this.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/// If a fixed-date holiday lands on a Sunday, Kenya observes it the
/// following Monday instead (the Public Holidays Act's standard rule).
function withSundayObservance(date: Date): Date {
  return date.getUTCDay() === 0 ? addDays(date, 1) : date;
}

/// Returns every computed Kenya public holiday that falls within `year`.
/// Pure function of the year number — nothing here reads from the database.
export function getKenyaPublicHolidays(year: number): KenyaHoliday[] {
  const holidays: KenyaHoliday[] = FIXED_HOLIDAYS.map((h) => ({
    id: `kenya-${h.slug}-${year}`,
    title: h.title,
    date: withSundayObservance(new Date(Date.UTC(year, h.month - 1, h.day))),
  }));

  const easter = easterSunday(year);
  holidays.push({
    id: `kenya-good-friday-${year}`,
    title: "Good Friday",
    date: addDays(easter, -2),
  });
  holidays.push({
    id: `kenya-easter-monday-${year}`,
    title: "Easter Monday",
    date: addDays(easter, 1),
  });

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/// Convenience for the calendar API: holidays for just one calendar month
/// (1-12) of `year`. Handles the one edge case where a requested month sits
/// right at a year boundary by computing from the correct year regardless.
export function getKenyaPublicHolidaysForMonth(year: number, month: number): KenyaHoliday[] {
  return getKenyaPublicHolidays(year).filter((h) => h.date.getUTCMonth() + 1 === month);
}
