import { generateJson } from "./gemini";

export type ParsedConstraint = {
  kind:
    | "PRIORITIZE_SUBJECT_TIME"
    | "AVOID_SUBJECT_TIME"
    | "MAX_LESSONS_PER_DAY"
    | "MINIMIZE_TEACHER_MOVEMENT"
    | "GENERIC";
  /// Matched against Subject.code/name — null if this instruction isn't
  /// about a specific subject.
  subjectCode?: string | null;
  /// 1-based period range, e.g. {start:1,end:3} for "the morning" on an
  /// 8-period day. Only meaningful for PRIORITIZE_SUBJECT_TIME / AVOID_SUBJECT_TIME.
  periodStart?: number | null;
  periodEnd?: number | null;
  maxLessonsPerDay?: number | null;
  /// One-line plain-English restatement, shown in the UI so a Principal can
  /// confirm the AI understood them correctly — this is what's rendered as
  /// the constraint "chip", not the raw instruction.
  summary: string;
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: {
      type: "STRING",
      enum: [
        "PRIORITIZE_SUBJECT_TIME",
        "AVOID_SUBJECT_TIME",
        "MAX_LESSONS_PER_DAY",
        "MINIMIZE_TEACHER_MOVEMENT",
        "GENERIC",
      ],
    },
    subjectCode: { type: "STRING", nullable: true },
    periodStart: { type: "INTEGER", nullable: true },
    periodEnd: { type: "INTEGER", nullable: true },
    maxLessonsPerDay: { type: "INTEGER", nullable: true },
    summary: { type: "STRING" },
  },
  required: ["kind", "summary"],
};

const FALLBACK: ParsedConstraint = { kind: "GENERIC", summary: "" };

/// Turns one free-text instruction (e.g. "Prioritize Mathematics in the
/// morning") into a structured hint the deterministic scheduler in
/// timetableGenerator.ts can actually apply. Never throws — if Gemini is
/// unavailable or misconfigured, the instruction is stored as a GENERIC
/// constraint with the raw text as its summary, so it's still visible to
/// the Principal (as a reminder to apply manually) even though the
/// generator won't be able to act on it automatically.
export async function parseTimetableConstraint(
  schoolId: string,
  instruction: string,
  knownSubjects: { code: string; name: string }[],
  periodsPerDay: number
): Promise<ParsedConstraint> {
  const subjectList = knownSubjects.map((s) => `${s.code} (${s.name})`).join(", ") || "none yet";

  const prompt = `A school Principal is configuring an AI timetable generator and typed this instruction:
"${instruction}"

The school day has periods 1 to ${periodsPerDay}. Known subject codes: ${subjectList}.

Classify the instruction and extract any specifics:
- PRIORITIZE_SUBJECT_TIME: wants a subject scheduled in a period range (e.g. "morning" ≈ periods 1-3, "afternoon" ≈ the second half of the day).
- AVOID_SUBJECT_TIME: wants a subject kept OUT of a period range.
- MAX_LESSONS_PER_DAY: sets a cap on lessons per teacher per day.
- MINIMIZE_TEACHER_MOVEMENT: wants teacher movement between classes reduced.
- GENERIC: anything else — still write a clear one-line summary of what they're asking for.

If a subject is mentioned, match it to the closest known subject code. If the instruction doesn't specify exact period numbers, infer a reasonable range for the school day given above. Always fill "summary" with a short, plain-English restatement of the instruction.`;

  const { value } = await generateJson<ParsedConstraint>(schoolId, prompt, {
    responseSchema: RESPONSE_SCHEMA,
    temperature: 0.1,
    fallback: { ...FALLBACK, summary: instruction },
  });

  return value.summary ? value : { ...value, summary: instruction };
}
