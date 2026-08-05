/**
 * Shared navigation items for every timetable sub-page.
 *
 * getTimetableNav(basePath) is the primary export — use it when the nav
 * must point to a different route root (e.g. /staff/timetable vs
 * /principal/timetable). The TIMETABLE_NAV constant is kept for
 * backward compatibility; existing principal pages use it unchanged.
 */
export function getTimetableNav(basePath: string) {
  return [
    { href: `${basePath}`,           label: "Overview", exact: true },
    { href: `${basePath}/generate`,  label: "Generate"              },
    { href: `${basePath}/builder`,   label: "Builder"               },
    { href: `${basePath}/settings`,  label: "Settings"              },
  ];
}

// Backward-compat constant — principal pages use this unchanged.
export const TIMETABLE_NAV = getTimetableNav("/principal/timetable");
