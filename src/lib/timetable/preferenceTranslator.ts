/**
 * src/lib/timetable/preferenceTranslator.ts
 *
 * Lightweight AI-assisted preference translation.
 * 
 * AI's ONLY role: Convert natural language like "I want maths in the morning"
 * into a structured constraint rule that the deterministic engine reads.
 * 
 * AI does NOT generate timetables, solve schedules, or make placement decisions.
 */

import { TimetableSession } from "@prisma/client";

export type PreferenceInput = {
  instruction: string;
  subjectCode?: string;
  /** School's actual subject list — used to match subject names/codes in the instruction */
  availableSubjects?: Array<{ code: string; name: string }>;
};

export type TranslatedPreference = {
  subjectCode: string | null;
  preferredSession: TimetableSession | null;
  isHard: boolean;
  confidence: number; // 0-1
  explanation: string;
  metadata?: {
    originalInstruction: string;
    detectedKeywords: string[];
    ambiguities?: string[];
  };
};

export type TranslationResult = {
  success: boolean;
  preference: TranslatedPreference | null;
  error?: string;
  needsClarification?: string[];
};

/**
 * Built-in fallback subject patterns for common subjects.
 * These only apply when availableSubjects is not provided.
 */
const BUILTIN_SUBJECT_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(math|maths|mathematics)\b/, code: "MATH" },
  { pattern: /\b(english|eng)\b/, code: "ENG" },
  { pattern: /\b(kiswahili|swahili|kisw)\b/, code: "KISW" },
  { pattern: /\b(biology|bio)\b/, code: "BIO" },
  { pattern: /\b(physics|phys)\b/, code: "PHY" },
  { pattern: /\b(chemistry|chem)\b/, code: "CHEM" },
  { pattern: /\b(history|hist)\b/, code: "HIST" },
  { pattern: /\b(geography|geo)\b/, code: "GEO" },
  { pattern: /\b(physical\s*education|p\.?e\.?)\b/, code: "PE" },
  { pattern: /\b(computer\s*(science|studies)?|ict|c\.?s\.?)\b/, code: "ICT" },
  { pattern: /\b(art(s)?|fine\s*art)\b/, code: "ART" },
  { pattern: /\b(music)\b/, code: "MUS" },
  { pattern: /\b(religious\s*(education|studies)|r\.?e\.?|cre|ire)\b/, code: "RE" },
  { pattern: /\b(social\s*studies|social)\b/, code: "SST" },
  { pattern: /\b(science)\b/, code: "SCI" },
  { pattern: /\b(french)\b/, code: "FRE" },
  { pattern: /\b(german)\b/, code: "GER" },
  { pattern: /\b(arabic)\b/, code: "ARA" },
  { pattern: /\b(business\s*(studies)?|biz)\b/, code: "BUS" },
  { pattern: /\b(economics|econ)\b/, code: "ECON" },
  { pattern: /\b(agriculture|agri)\b/, code: "AGRI" },
  { pattern: /\b(home\s*science)\b/, code: "HSC" },
];

/**
 * Attempt to detect a subject code from free text.
 * First checks against the school's real subject list (by code and name),
 * then falls back to the built-in common patterns.
 */
function detectSubjectCode(
  instruction: string,
  availableSubjects?: Array<{ code: string; name: string }>
): string | null {
  const lower = instruction.toLowerCase();

  if (availableSubjects && availableSubjects.length > 0) {
    // 1. Exact code match (e.g. user typed "MATH" or "math")
    for (const s of availableSubjects) {
      const code = s.code.toUpperCase();
      const codeRegex = new RegExp(`\\b${escapeRegex(s.code)}\\b`, "i");
      if (codeRegex.test(lower)) return code;
    }

    // 2. Full subject name match (e.g. "Mathematics" → MATH)
    for (const s of availableSubjects) {
      const nameRegex = new RegExp(`\\b${escapeRegex(s.name)}\\b`, "i");
      if (nameRegex.test(lower)) return s.code.toUpperCase();
    }

    // 3. Subject name prefix match (handles plurals and abbreviations)
    //    e.g. "Maths" matching a subject named "Mathematics"
    for (const s of availableSubjects) {
      const words = s.name.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 4) {
          // avoid tiny words like "of", "and"
          const prefixRegex = new RegExp(`\\b${escapeRegex(word)}`, "i");
          if (prefixRegex.test(lower)) return s.code.toUpperCase();
        }
      }
    }
  }

  // 4. Fallback: built-in patterns
  for (const { pattern, code } of BUILTIN_SUBJECT_PATTERNS) {
    if (pattern.test(lower)) return code;
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect session from natural language — covers many common phrasings.
 */
function detectSession(instruction: string): TimetableSession | null {
  const lower = instruction.toLowerCase();

  // Morning indicators
  if (
    /\b(morning|early|first\s*(period|lesson|class)|beginning\s*of\s*(day|school)|start\s*of\s*(day|school))\b/.test(lower) ||
    /\b([6-9]|10)\s*(am|a\.m\.)\b/.test(lower) ||
    /\bbefore\s*(break|recess|noon|lunch)\b/.test(lower) ||
    /\bfirst\s*(half|block)\b/.test(lower)
  ) {
    return TimetableSession.MORNING;
  }

  // Afternoon indicators
  if (
    /\b(afternoon|midday|after\s*lunch|after\s*break|post[\s-]lunch|lunch\s*time|lunchtime)\b/.test(lower) ||
    /\b(12|1[0-2]|[1-3])\s*(pm|p\.m\.)\b/.test(lower) ||
    /\bmiddle\s*(of\s*(the\s*)?day|period|session)\b/.test(lower) ||
    /\bsecond\s*(half|block|session)\b/.test(lower)
  ) {
    return TimetableSession.AFTERNOON;
  }

  // Evening / late-day indicators
  if (
    /\b(evening|late|end\s*of\s*(day|school)|last\s*(period|lesson|class|session)|closing)\b/.test(lower) ||
    /\b([4-9])\s*(pm|p\.m\.)\b/.test(lower) ||
    /\bafter\s*(school|afternoon)\b/.test(lower)
  ) {
    return TimetableSession.EVENING;
  }

  return null;
}

/**
 * Pattern-based preference translator (no AI needed for simple cases)
 */
export function translatePreferencePatternBased(
  input: PreferenceInput
): TranslationResult {
  const instruction = input.instruction.trim();
  const detectedKeywords: string[] = [];

  // ── 1. Resolve subject code ──────────────────────────────────────────────
  let subjectCode = input.subjectCode?.toUpperCase() || null;

  if (!subjectCode) {
    subjectCode = detectSubjectCode(instruction, input.availableSubjects);
    if (subjectCode) detectedKeywords.push(subjectCode);
  }

  if (!subjectCode) {
    const subjectList =
      input.availableSubjects && input.availableSubjects.length > 0
        ? `Available subjects: ${input.availableSubjects.map((s) => `${s.code} (${s.name})`).join(", ")}`
        : "Please include the subject name or code in your instruction.";

    return {
      success: false,
      preference: null,
      error: "Could not identify subject",
      needsClarification: [
        `Which subject does this preference apply to? ${subjectList}`,
      ],
    };
  }

  // ── 2. Resolve session ───────────────────────────────────────────────────
  const preferredSession = detectSession(instruction);

  if (!preferredSession) {
    return {
      success: false,
      preference: null,
      error: "Could not identify preferred session",
      needsClarification: [
        'Should this be in the morning, afternoon, or evening? (e.g. "MATH must be in the morning")',
      ],
    };
  }
  detectedKeywords.push(preferredSession.toLowerCase());

  // ── 3. Hard vs soft constraint ───────────────────────────────────────────
  const lower = instruction.toLowerCase();
  let isHard = false;

  if (/\b(must|always|require[sd]?|needs?\s+to\s+be|essential|critical|mandatory|enforce[d]?)\b/.test(lower)) {
    isHard = true;
    detectedKeywords.push("hard constraint");
  } else {
    // Default to soft preference even if no keyword found
    isHard = false;
    detectedKeywords.push("soft preference");
  }

  return {
    success: true,
    preference: {
      subjectCode,
      preferredSession,
      isHard,
      confidence: 0.9,
      explanation: `${subjectCode} ${isHard ? "must" : "should preferably"} be scheduled in the ${preferredSession.toLowerCase()} session`,
      metadata: {
        originalInstruction: instruction,
        detectedKeywords,
      },
    },
  };
}

/**
 * AI-assisted preference translator using Gemini
 * Only called when pattern-based fails or confidence is low
 */
export async function translatePreferenceWithAI(
  input: PreferenceInput,
  geminiApiKey: string
): Promise<TranslationResult> {
  try {
    const prompt = buildTranslationPrompt(input);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent parsing
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text) {
      throw new Error("No response from Gemini");
    }

    // Parse AI response
    return parseAIResponse(text, input.instruction);
  } catch (error) {
    console.error("AI translation error:", error);

    // Fall back to pattern-based
    const patternResult = translatePreferencePatternBased(input);
    if (patternResult.success) {
      return {
        ...patternResult,
        preference: patternResult.preference
          ? {
              ...patternResult.preference,
              confidence: 0.7, // Lower confidence since AI failed
            }
          : null,
      };
    }

    return {
      success: false,
      preference: null,
      error: "AI translation failed and pattern matching couldn't parse instruction",
      needsClarification: [
        "Please rephrase your preference more clearly",
        "Example: 'Mathematics should be in the morning'",
      ],
    };
  }
}

/**
 * Build prompt for AI translation
 */
function buildTranslationPrompt(input: PreferenceInput): string {
  const subjectListSection =
    input.availableSubjects && input.availableSubjects.length > 0
      ? `\nAVAILABLE SUBJECT CODES (you MUST use one of these exact codes):
${input.availableSubjects.map((s) => `  ${s.code} = ${s.name}`).join("\n")}`
      : "";

  return `You are a timetable preference parser. Your ONLY job is to extract structured information from a natural language scheduling preference.

INPUT: "${input.instruction}"
${input.subjectCode ? `SUBJECT CODE (already known): ${input.subjectCode}` : ""}${subjectListSection}

Extract the following information:
1. SUBJECT: The exact subject code from the list above that best matches the instruction. Return "UNKNOWN" only if no subject matches.
2. SESSION: MORNING (early, before break, start of day), AFTERNOON (after lunch, midday, after break), or EVENING (late, end of day, last period). Return "NONE" if not specified.
3. HARD_CONSTRAINT: true if mandatory (must, always, required, needs to be), false if a preference (prefer, should, would like, want).

Respond in this EXACT format (JSON only, no other text):
{
  "subject": "SUBJECT_CODE",
  "session": "MORNING" | "AFTERNOON" | "EVENING" | "NONE",
  "isHard": true | false,
  "confidence": 0.0-1.0,
  "explanation": "brief explanation of what was understood"
}`;
}

/**
 * Parse AI response into structured preference
 */
function parseAIResponse(
  aiResponse: string,
  originalInstruction: string
): TranslationResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = aiResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?$/g, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Validate subject
    const subjectCode =
      parsed.subject && parsed.subject !== "UNKNOWN" ? parsed.subject : null;

    if (!subjectCode) {
      return {
        success: false,
        preference: null,
        error: "Could not identify subject from instruction",
        needsClarification: ["Which subject does this preference apply to?"],
      };
    }

    // Validate session
    const sessionMap: Record<string, TimetableSession> = {
      MORNING: TimetableSession.MORNING,
      AFTERNOON: TimetableSession.AFTERNOON,
      EVENING: TimetableSession.EVENING,
    };

    const preferredSession =
      sessionMap[parsed.session?.toUpperCase()] || null;

    if (!preferredSession) {
      return {
        success: false,
        preference: null,
        error: "Could not identify preferred session",
        needsClarification: [
          "Should this be in the morning, afternoon, or evening?",
        ],
      };
    }

    return {
      success: true,
      preference: {
        subjectCode: subjectCode.toUpperCase(),
        preferredSession,
        isHard: Boolean(parsed.isHard),
        confidence: Math.min(Math.max(Number(parsed.confidence) || 0.7, 0), 1),
        explanation: parsed.explanation || `${subjectCode} in ${preferredSession}`,
        metadata: {
          originalInstruction,
          detectedKeywords: ["ai-parsed"],
        },
      },
    };
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return {
      success: false,
      preference: null,
      error: "Failed to parse AI response",
    };
  }
}

/**
 * Translate multiple preferences in batch
 */
export async function translatePreferencesBatch(
  inputs: PreferenceInput[],
  geminiApiKey?: string
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];

  for (const input of inputs) {
    // Try pattern-based first
    const patternResult = translatePreferencePatternBased(input);

    if (patternResult.success && patternResult.preference) {
      // If confidence is high, use pattern result
      if (patternResult.preference.confidence >= 0.8) {
        results.push(patternResult);
        continue;
      }
    }

    // Use AI if available and pattern-based had low confidence or failed
    if (geminiApiKey) {
      const aiResult = await translatePreferenceWithAI(input, geminiApiKey);
      results.push(aiResult);
    } else {
      // No AI available, use pattern result even if confidence is low
      results.push(patternResult);
    }

    // Small delay between AI requests
    if (geminiApiKey) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Validate translated preference makes sense
 */
export function validateTranslatedPreference(
  preference: TranslatedPreference,
  availableSubjects: string[]
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check if subject exists
  if (
    preference.subjectCode &&
    !availableSubjects.includes(preference.subjectCode.toUpperCase())
  ) {
    warnings.push(
      `Subject code "${preference.subjectCode}" not found in school's subject list`
    );
  }

  // Warn on low confidence
  if (preference.confidence < 0.5) {
    warnings.push("Low confidence in translation - please review carefully");
  }

  return {
    valid: warnings.length === 0 || preference.confidence >= 0.7,
    warnings,
  };
}

/**
 * Format preference for display
 */
export function formatPreferenceForDisplay(
  preference: TranslatedPreference
): string {
  const hardness = preference.isHard ? "must" : "should preferably";
  return `${preference.subjectCode || "Unknown subject"} ${hardness} be in the ${preference.preferredSession?.toLowerCase() || "unspecified"} session`;
}
