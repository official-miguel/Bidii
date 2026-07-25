/**
 * src/lib/messaging/placeholders.ts
 *
 * Substitutes placeholder tokens in a message body with per-recipient data.
 * Tokens with no matching context value are replaced with [unknown].
 *
 * Supported static tokens: /name /class /stream /Admission /staffname /staffno /results
 * Dynamic group tokens:     /<grouptoken>name  e.g. /bomname, /parentsname
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

/**
 * Convert a group name into its placeholder token suffix.
 * "BOM" → "bom", "Board of Management" → "boardofmanagement"
 * Token in the message body: /<slug>name  e.g. /bomname
 */
export function groupNameToSlug(groupName: string): string {
  return groupName.toLowerCase().replace(/\s+/g, "");
}

/** The full token string inserted into a message body, e.g. "/bomname" */
export function groupToken(groupName: string): string {
  return `/${groupNameToSlug(groupName)}name`;
}

/**
 * Substitute every dynamic group token present in the body.
 * `groups` is an array of { name, recipientName } — the name of the group
 * and the resolved name of the current recipient within that group.
 *
 * Called at send time after applyPlaceholders(), or for preview rendering.
 */
export function applyGroupTokens(
  body: string,
  groups: Array<{ name: string; recipientName: string }>
): string {
  let out = body;
  for (const g of groups) {
    const token = groupToken(g.name);
    out = out.split(token).join(g.recipientName || "[unknown]");
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
