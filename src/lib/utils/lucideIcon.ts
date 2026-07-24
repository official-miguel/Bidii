/**
 * src/lib/utils/lucideIcon.ts
 *
 * Helper for resolving a Lucide icon component by name at runtime.
 *
 * IMPORTANT: Do NOT use `import * as LucideIcons from "lucide-react"` here.
 * next.config.js applies a `modularizeImports` transform that rewrites every
 * static named import from "lucide-react" into a direct per-file path.
 * That transform is only defined for named/default imports — it cannot handle
 * namespace (`import *`) imports and produces a broken module reference that
 * crashes the webpack bundler for every chunk that includes this file.
 *
 * Instead we use `require()` which is resolved at runtime and is invisible
 * to the static modularizeImports analysis, so the full lucide-react package
 * is loaded once and indexed by icon name.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

type LucideIconComponent = ComponentType<LucideProps>;

// Load the full lucide-react module via require so the static
// modularizeImports transform in next.config.js is not applied.
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
