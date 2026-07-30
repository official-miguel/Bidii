import { callGemini } from "./gemini";

/// AI helpers for the Records module. Both return null instead of throwing —
/// summaries are optional and must never block saving the record.
/// Results are persisted on the record (cached), so each is generated once.

export async function summarizeDisciplineFile(
  schoolId: string,
  file: { mimeType: string; base64: string },
  context: { studentName: string; offence?: string }
): Promise<string | null> {
  try {
    const text = await callGemini(
      schoolId,
      `This is a school discipline document/photo concerning student ${context.studentName}` +
        (context.offence ? ` (recorded offence: ${context.offence})` : "") +
        `. Extract the important information and write ONE very short plain-text summary sentence, e.g. "Found vaping." or "Late to school repeatedly." No markdown, no preamble.`,
      { inlineFile: file, temperature: 0.2, timeoutMs: 20000 }
    );
    return text.trim().slice(0, 300) || null;
  } catch {
    return null;
  }
}

export async function summarizeAchievement(
  schoolId: string,
  achievement: { title: string; description?: string | null; category: string; awardLevel?: string | null }
): Promise<string | null> {
  try {
    const text = await callGemini(
      schoolId,
      `Summarize this student achievement into ONE very short plain-text phrase (max ~8 words), e.g. input "Won first position in the National Science Congress." → "National Science Congress Winner.". No markdown, no preamble.\n\nTitle: ${achievement.title}\nCategory: ${achievement.category}\nAward level: ${achievement.awardLevel || "—"}\nDescription: ${achievement.description || "—"}`,
      { temperature: 0.2 }
    );
    return text.trim().slice(0, 200) || null;
  } catch {
    return null;
  }
}
