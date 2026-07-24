/**
 * src/lib/ai/timetableAnalytics.ts — Stage 2
 *
 * Analytics and AI-explanation layer.
 *
 * Takes the engine result + validation report + optimization summary and
 * produces:
 *  • Quality score decomposition (7 metrics → final 0-100 score)
 *  • Teacher workload summary table
 *  • Lesson distribution heatmap (class × day)
 *  • Subject spread report (per class, per subject)
 *  • Idle-period and consecutive-run counts
 *  • Gemini-powered explanations describing WHY decisions were made,
 *    WHY conflicts occurred, WHAT the admin should do — never making
 *    decisions on the admin's behalf
 *
 * The Gemini call is optional; if the school has no API key configured
 * or the call fails, all numeric analytics are still returned intact.
 */

import type { EngineResult, EngineSlot }  from "./timetableEngine";
import type { ValidationReport }           from "./timetableValidator";
import type { OptimizationSummary }        from "./timetableOptimizer";
import { callGemini, AiServiceError }      from "./gemini";

// ── Public types ──────────────────────────────────────────────────────────

export type QualityMetric = {
  name:        string;
  label:       string;
  score:       number;   // 0-100
  weight:      number;   // 0-1; all weights sum to 1
  description: string;
};

export type TeacherWorkloadRow = {
  teacherId:   string;
  teacherName: string;
  totalLessons:number;
  byDay:       Record<number, number>;  // dayOfWeek → lesson count
  idlePeriods: number;
  loadVariance:number;  // std-dev of per-day counts (lower = more even)
};

export type SubjectSpreadRow = {
  classId:     string;
  className:   string;
  subjectId:   string;
  subjectCode: string;
  totalLessons:number;
  daysUsed:    number[];
  spreadScore: number; // 0-100: 100 means perfectly spread
};

export type AnalyticsReport = {
  qualityMetrics:   QualityMetric[];
  overallQuality:   number;   // weighted sum, 0-100
  teacherWorkload:  TeacherWorkloadRow[];
  subjectSpread:    SubjectSpreadRow[];
  heatmap:          HeatmapCell[][];  // [dayOfWeek][period] = count of lessons
  recommendations:  string[];
  aiExplanation:    string | null;
  aiExplanationError: string | null;
};

export type HeatmapCell = {
  dayOfWeek:  number;
  period:     number;
  lessonCount:number;
  teacherIds: string[];
};

export type SlotMeta = {
  classId:    string;
  className:  string;
  teacherId:  string;
  teacherName:string;
  subjectId:  string;
  subjectCode:string;
};

// ── Quality metric computation ────────────────────────────────────────────

function computeQualityMetrics(
  slots:       EngineSlot[],
  validation:  ValidationReport,
  optimizer:   OptimizationSummary,
  engineResult:EngineResult,
  _config:     { periodsPerDay: number; operatingDays: number[]; maxLessonsPerTeacherPerDay: number },
): QualityMetric[] {
  const total = engineResult.fullyPlaced + engineResult.partiallyPlaced + engineResult.notPlaced;

  // 1. Lesson completion (weight 0.30)
  const completionPct = total > 0 ? (engineResult.fullyPlaced / total) * 100 : 0;

  // 2. Conflict-free (weight 0.25)
  const conflictScore = validation.passes.find((p) => p.name === "CONFLICT_FREE")?.passed ? 100 : 0;

  // 3. Workload compliance (weight 0.15)
  const workloadPass = validation.passes.find((p) => p.name === "WORKLOAD_COMPLIANCE");
  const workloadScore = workloadPass
    ? Math.max(0, 100 - workloadPass.issueCount * 20)
    : 100;

  // 4. Subject spread (weight 0.10)
  const spreadPass  = validation.passes.find((p) => p.name === "SUBJECT_SPREAD");
  const spreadScore = spreadPass
    ? Math.max(0, 100 - spreadPass.issueCount * 15)
    : 100;

  // 5. Teacher availability (weight 0.10)
  const availPass  = validation.passes.find((p) => p.name === "TEACHER_AVAILABILITY");
  const availScore = availPass?.passed ? 100 : Math.max(0, 100 - (availPass?.issueCount ?? 0) * 25);

  // 6. Idle-period minimisation (weight 0.05)
  const totalIdle  = [...engineResult.analytics.idlePeriodsByTeacher.values()].reduce((a, b) => a + b, 0);
  const idleScore  = Math.max(0, 100 - totalIdle * 3);

  // 7. Consecutive-run avoidance (weight 0.05)
  const totalRuns  = [...engineResult.analytics.consecutiveRunsByClass.values()].reduce((a, b) => a + b, 0);
  const runScore   = Math.max(0, 100 - totalRuns * 10);

  return [
    { name: "LESSON_COMPLETION",    label: "Lesson completion",       score: Math.round(completionPct), weight: 0.30, description: `${engineResult.fullyPlaced}/${total} subjects fully scheduled.` },
    { name: "CONFLICT_FREE",        label: "No scheduling conflicts",  score: conflictScore,              weight: 0.25, description: validation.passes.find(p=>p.name==="CONFLICT_FREE")?.issues.length === 0 ? "Zero conflicts." : `${validation.passes.find(p=>p.name==="CONFLICT_FREE")?.issueCount} conflict(s) found.` },
    { name: "WORKLOAD_COMPLIANCE",  label: "Teacher workload balance", score: Math.round(workloadScore),  weight: 0.15, description: workloadPass?.issueCount === 0 ? "All teachers within daily limits." : `${workloadPass?.issueCount} workload violation(s).` },
    { name: "SUBJECT_SPREAD",       label: "Lesson day spread",        score: Math.round(spreadScore),    weight: 0.10, description: spreadPass?.issueCount === 0 ? "All subjects spread across days." : `${spreadPass?.issueCount} subject(s) not spread enough.` },
    { name: "TEACHER_AVAILABILITY", label: "Availability respected",   score: Math.round(availScore),     weight: 0.10, description: availPass?.passed ? "All availability respected." : `${availPass?.issueCount} availability violation(s).` },
    { name: "IDLE_MINIMISATION",    label: "Minimal teacher idle time",score: Math.round(idleScore),      weight: 0.05, description: `Total idle periods across all teachers: ${totalIdle}.` },
    { name: "CONSECUTIVE_AVOIDANCE",label: "No consecutive same-subject",score: Math.round(runScore),    weight: 0.05, description: `${totalRuns} triple-consecutive same-subject run(s).` },
  ];
}

// ── Main analytics function ───────────────────────────────────────────────

export async function buildAnalyticsReport(input: {
  slots:        EngineSlot[];
  slotMeta:     Map<string, SlotMeta>;   // subjectId/classId → display names
  engineResult: EngineResult;
  validation:   ValidationReport;
  optimizer:    OptimizationSummary;
  config:       { periodsPerDay: number; operatingDays: number[]; maxLessonsPerTeacherPerDay: number };
  schoolId:     string;
  classCount:   number;
  generateAiExplanation: boolean;
}): Promise<AnalyticsReport> {
  const { slots, slotMeta, engineResult, validation, optimizer, config, schoolId } = input;

  // ── Quality metrics ─────────────────────────────────────────────────────
  const qualityMetrics = computeQualityMetrics(slots, validation, optimizer, engineResult, config);
  const overallQuality = Math.round(
    qualityMetrics.reduce((sum, m) => sum + m.score * m.weight, 0)
  );

  // ── Teacher workload ────────────────────────────────────────────────────
  const teacherMap = new Map<string, TeacherWorkloadRow>();
  for (const s of slots) {
    const meta = slotMeta.get(s.classId + "|" + s.subjectId) ?? null;
    if (!teacherMap.has(s.teacherId)) {
      teacherMap.set(s.teacherId, {
        teacherId:    s.teacherId,
        teacherName:  meta?.teacherName ?? s.teacherId,
        totalLessons: 0,
        byDay:        {},
        idlePeriods:  engineResult.analytics.idlePeriodsByTeacher.get(s.teacherId) ?? 0,
        loadVariance: 0,
      });
    }
    const row = teacherMap.get(s.teacherId)!;
    row.totalLessons++;
    row.byDay[s.dayOfWeek] = (row.byDay[s.dayOfWeek] ?? 0) + 1;
  }

  // Compute load variance (std-dev of per-day counts)
  for (const row of teacherMap.values()) {
    const dayCounts = Object.values(row.byDay);
    if (dayCounts.length === 0) { row.loadVariance = 0; continue; }
    const mean = dayCounts.reduce((a, b) => a + b, 0) / dayCounts.length;
    row.loadVariance = Math.sqrt(dayCounts.reduce((a, c) => a + (c - mean) ** 2, 0) / dayCounts.length);
  }

  const teacherWorkload = [...teacherMap.values()].sort((a, b) => b.totalLessons - a.totalLessons);

  // ── Subject spread ──────────────────────────────────────────────────────
  const spreadAccum = new Map<string, { days: Set<number>; total: number; className: string; subjectCode: string }>();
  for (const s of slots) {
    const k    = `${s.classId}|${s.subjectId}`;
    const meta = slotMeta.get(s.classId + "|" + s.subjectId);
    if (!spreadAccum.has(k)) spreadAccum.set(k, { days: new Set(), total: 0,
      className: meta?.className ?? s.classId, subjectCode: meta?.subjectCode ?? s.subjectId });
    const r = spreadAccum.get(k)!;
    r.days.add(s.dayOfWeek); r.total++;
  }

  const subjectSpread: SubjectSpreadRow[] = [...spreadAccum.entries()].map(([key, val]) => {
    const [classId, subjectId] = key.split("|");
    const ideal = Math.min(val.total, config.operatingDays.length);
    const spreadScore = ideal > 0 ? Math.round((val.days.size / ideal) * 100) : 100;
    return { classId, className: val.className, subjectId, subjectCode: val.subjectCode,
      totalLessons: val.total, daysUsed: [...val.days].sort(), spreadScore };
  });

  // ── Heatmap (day × period → lesson count) ──────────────────────────────
  const heatmap: HeatmapCell[][] = config.operatingDays.map((day) =>
    Array.from({ length: config.periodsPerDay }, (_, i) => {
      const daySlots = slots.filter((s) => s.dayOfWeek === day && s.period === i + 1);
      return { dayOfWeek: day, period: i + 1, lessonCount: daySlots.length,
        teacherIds: [...new Set(daySlots.map((s) => s.teacherId))] };
    })
  );

  // ── Rule-based recommendations ─────────────────────────────────────────
  const recommendations: string[] = [];

  if (engineResult.notPlaced > 0)
    recommendations.push(`${engineResult.notPlaced} subject(s) could not be placed because no teacher is assigned. Go to Staff and assign teachers before regenerating.`);

  if (engineResult.partiallyPlaced > 0)
    recommendations.push(`${engineResult.partiallyPlaced} subject(s) were only partially scheduled. Consider raising the teacher daily lesson limit in Settings or adding co-teachers.`);

  const overloadedTeachers = teacherWorkload.filter(
    (t) => Object.values(t.byDay).some((c) => c > config.maxLessonsPerTeacherPerDay)
  );
  if (overloadedTeachers.length > 0)
    recommendations.push(`${overloadedTeachers.length} teacher(s) exceed the daily lesson cap: ${overloadedTeachers.slice(0,3).map(t=>t.teacherName).join(", ")}. Assign co-teachers or reduce their subject load.`);

  const highVarianceTeachers = teacherWorkload.filter((t) => t.loadVariance > 2);
  if (highVarianceTeachers.length > 0)
    recommendations.push(`${highVarianceTeachers.length} teacher(s) have uneven lesson distribution across the week. Run the optimizer to balance their loads.`);

  const poorSpread = subjectSpread.filter((r) => r.spreadScore < 50 && r.totalLessons > 1);
  if (poorSpread.length > 0)
    recommendations.push(`${poorSpread.length} subject(s) are concentrated on too few days. Run the optimizer's spread improvement pass or adjust the minSpreadDays setting.`);

  if (optimizer.remainingIssues.length > 0)
    recommendations.push(...optimizer.remainingIssues.slice(0, 3));

  // ── AI explanation (Gemini) ─────────────────────────────────────────────
  let aiExplanation:      string | null = null;
  let aiExplanationError: string | null = null;

  if (input.generateAiExplanation) {
    try {
      const metricLines = qualityMetrics.map(
        (m) => `${m.label}: ${m.score}/100 (${m.description})`
      ).join("\n");

      const prompt =
        `A school timetable was just generated for ${input.classCount} class(es).\n` +
        `Overall quality score: ${overallQuality}/100.\n` +
        `Key metrics:\n${metricLines}\n` +
        (validation.errorCount > 0
          ? `There are ${validation.errorCount} hard errors that MUST be fixed before publishing:\n` +
            validation.errors.slice(0, 5).map((e) => `• ${e.message}`).join("\n") + "\n"
          : "No hard errors were found.\n") +
        (recommendations.length > 0
          ? `Recommendations: ${recommendations.slice(0, 4).join(" | ")}\n`
          : "") +
        `Optimizer applied ${optimizer.movesApplied} improvements.\n\n` +
        `Write a 3-4 paragraph explanation for the Principal:\n` +
        `Paragraph 1: Summarise what the engine did and the overall quality.\n` +
        `Paragraph 2: Explain any conflicts or gaps and their likely causes (teacher scarcity, insufficient daily cap, etc.).\n` +
        `Paragraph 3: Give 2-3 concrete, actionable steps the administrator should take next.\n` +
        `Paragraph 4: Note what is working well.\n` +
        `Plain text, no markdown, no bullet points. Never make administrative decisions — only explain and suggest.`;

      aiExplanation = await callGemini(schoolId, prompt, { temperature: 0.5, timeoutMs: 15000 });
    } catch (e) {
      aiExplanationError = e instanceof AiServiceError ? e.message : "AI explanation unavailable right now.";
    }
  }

  return { qualityMetrics, overallQuality, teacherWorkload, subjectSpread, heatmap,
    recommendations, aiExplanation, aiExplanationError };
}
