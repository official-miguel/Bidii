/**
 * src/lib/messaging/placeholders.ts
 *
 * Substitutes placeholder tokens in a message body with per-recipient data.
 * Tokens with no matching context value are replaced with [unknown].
 *
 * Supported tokens: /name /class /stream /Admission /staffname /staffno /results
 *
 * SERVER-SIDE ONLY (also safe to call client-side for preview rendering).
 */

export type PlaceholderContext = {
  name?:      string; // student full name or teacher full name
  class?:     string; // SchoolClass.name
  stream?:    string; // stream portion of class name
  Admission?: string; // Student.admissionNumber
  staffname?: string; // Teacher.fullName
  staffno?:   string; // Teacher.staffId
  results?:   string; // formatted multi-line results block
};

const TOKENS: (keyof PlaceholderContext)[] = [
  "name",
  "class",
  "stream",
  "Admission",
  "staffname",
  "staffno",
  "results",
];

export function applyPlaceholders(body: string, ctx: PlaceholderContext): string {
  let out = body;
  for (const token of TOKENS) {
    const value = ctx[token];
    const replacement = value !== undefined && value !== null && value !== ""
      ? value
      : `[unknown]`;
    // Replace all occurrences of /<token> (case-sensitive, word-boundary aware)
    out = out.split(`/${token}`).join(replacement);
  }
  return out;
}

/** Extract the stream from a class name, e.g. "Form 3 North" → "North" */
export function extractStream(className: string): string {
  const parts = className.trim().split(/\s+/);
  // If the class name has more than 2 parts, take everything after the form number
  if (parts.length >= 3) return parts.slice(2).join(" ");
  return "";
}
