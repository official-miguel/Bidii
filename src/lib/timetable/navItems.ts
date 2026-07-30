/**
 * Shared navigation items for every timetable sub-page.
 *
 * Day Template, Requirements, Preferences, and Versions are intentionally
 * excluded here — they are only accessible via the Settings hub page.
 */
export const TIMETABLE_NAV = [
  { href: "/principal/timetable",          label: "Overview", exact: true },
  { href: "/principal/timetable/generate", label: "Generate"             },
  { href: "/principal/timetable/builder",  label: "Builder"              },
  { href: "/principal/timetable/settings", label: "Settings"             },
];
