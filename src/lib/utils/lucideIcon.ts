/**
 * src/lib/utils/lucideIcon.ts
 *
 * Helper for resolving a Lucide icon component by name at runtime.
 *
 * We use `require("lucide-react")` rather than a static `import *` so that
 * Next.js's `optimizePackageImports` transform — which only rewrites static
 * named imports — does not interfere with the full-package load needed for
 * dynamic name-based resolution.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

type LucideIconComponent = ComponentType<LucideProps>;

// Load the full lucide-react module via require so the static
// optimizePackageImports transform only rewrites named imports — not require().
// The cast through `unknown` is required because lucide-react exports
// ForwardRefExoticComponents which TypeScript's structural check would
// otherwise reject as incompatible with ComponentType<LucideProps>.
const lucideIcons = require("lucide-react") as unknown as Record<
  string,
  LucideIconComponent | undefined
>;

/**
 * Returns the Lucide icon component for `name`, falling back to
 * `Circle` if the name is not found or is undefined.
 *
 * Usage:
 *   const Icon = getLucideIcon("GraduationCap");
 *   <Icon className="h-4 w-4" strokeWidth={1.8} />
 */
export function getLucideIcon(name: string | undefined): LucideIconComponent {
  if (!name) return lucideIcons["Circle"]!;
  return lucideIcons[name] ?? lucideIcons["Circle"]!;
}
