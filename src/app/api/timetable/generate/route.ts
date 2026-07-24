import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { generateTimetable, GenPreferences } from "@/lib/ai/timetableGenerator";
import type { ParsedConstraint } from "@/lib/ai/constraintParser";
import { callGemini, AiServiceError } from "@/lib/ai/gemini";

const schema = z.object({
  // Omit for "every class in the school".
  classIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const [classesRaw, subjectsRaw, teacherSubjects, unavailabilityRows, config, constraints, pinnedRows] =
    await Promise.all([
      prisma.schoolClass.findMany({
        where: {
          schoolId: user.schoolId,
          ...(parsed.data.classIds ? { id: { in: parsed.data.classIds } } : {}),
        },
        select: { id: true, name: true, form: true },
      }),
      prisma.subject.findMany({
        where: { schoolId: user.schoolId, type: "CORE" },
        select: {
          id: true,
          code: true,
          name: true,
          applicableForms: true,
          lessonsPerWeek: true,
          doubleLesson: true,
          requiresSpecialRoom: true,
        },
      }),
      prisma.teacherSubject.findMany({
        where: { subject: { schoolId: user.schoolId } },
        select: { subjectId: true, teacherId: true },
      }),
      prisma.teacherUnavailability.findMany({
        where: { teacher: { schoolId: user.schoolId } },
        select: { teacherId: true, dayOfWeek: true, period: true },
      }),
      prisma.timetableConfig.findUnique({ where: { schoolId: user.schoolId } }),
      prisma.aiTimetableConstraint.findMany({ where: { schoolId: user.schoolId } }),
      // Standing "who teaches this class this subject" assignments — the
      // generator must keep reusing these rather than re-deciding on every
      // run (Section: AI Timetable Generator / 2C).
      prisma.classSubjectTeacher.findMany({
        where: { schoolClass: { schoolId: user.schoolId } },
        select: { classId: true, subjectId: true, teacherId: true },
      }),
    ]);

  if (classesRaw.length === 0) {
    return NextResponse.json({ error: "No classes to generate a timetable for." }, { status: 400 });
  }
  if (subjectsRaw.length === 0) {
    return NextResponse.json(
      { error: "Add core subjects before generating a timetable." },
      { status: 400 }
    );
  }

  const subjectsByForm = new Map<number, typeof subjectsRaw>();
  for (const s of subjectsRaw) {
    for (const form of s.applicableForms) {
      if (!subjectsByForm.has(form)) subjectsByForm.set(form, []);
      subjectsByForm.get(form)!.push(s);
    }
  }

  const teachersBySubject = new Map<string, string[]>();
  for (const ts of teacherSubjects) {
    if (!teachersBySubject.has(ts.subjectId)) teachersBySubject.set(ts.subjectId, []);
    teachersBySubject.get(ts.subjectId)!.push(ts.teacherId);
  }

  const unavailability = new Map<string, Set<string>>();
  for (const row of unavailabilityRows) {
    if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
    unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  // If this is a partial regeneration (some classes, not all), any class
  // NOT being touched keeps its existing timetable — so a teacher already
  // booked there must be treated as unavailable for the classes we ARE
  // generating, or the draft could clash with a timetable we're not
  // rewriting. (When regenerating everything, there's nothing outside the
  // batch to conflict with, so this is a no-op.)
  const regeneratingClassIds = new Set(classesRaw.map((c) => c.id));
  const otherSlots = await prisma.timetableSlot.findMany({
    where: { schoolId: user.schoolId, classId: { notIn: [...regeneratingClassIds] } },
    select: { teacherId: true, dayOfWeek: true, period: true },
  });
  for (const row of otherSlots) {
    if (!unavailability.has(row.teacherId)) unavailability.set(row.teacherId, new Set());
    unavailability.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  const preferences: GenPreferences = {
    prioritized: new Map(),
    avoided: new Map(),
    maxLessonsPerDayOverride: null,
  };
  for (const c of constraints) {
    const p = c.parsed as ParsedConstraint | null;
    if (!p) continue;
    if (p.kind === "PRIORITIZE_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd) {
      preferences.prioritized.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    }
    if (p.kind === "AVOID_SUBJECT_TIME" && p.subjectCode && p.periodStart && p.periodEnd) {
      preferences.avoided.set(p.subjectCode.toUpperCase(), { start: p.periodStart, end: p.periodEnd });
    }
    if (p.kind === "MAX_LESSONS_PER_DAY" && p.maxLessonsPerDay) {
      preferences.maxLessonsPerDayOverride = preferences.maxLessonsPerDayOverride
        ? Math.min(preferences.maxLessonsPerDayOverride, p.maxLessonsPerDay)
        : p.maxLessonsPerDay;
    }
  }

  const resolvedConfig = {
    periodsPerDay: config?.periodsPerDay ?? 8,
    gamesDayOfWeek: config?.gamesDayOfWeek ?? null,
    gamesPeriod: config?.gamesPeriod ?? null,
    maxLessonsPerTeacherPerDay: config?.maxLessonsPerTeacherPerDay ?? 6,
  };

  const pinnedAssignments = new Map<string, string>();
  for (const row of pinnedRows) {
    pinnedAssignments.set(`${row.classId}-${row.subjectId}`, row.teacherId);
  }

  const result = generateTimetable({
    classes: classesRaw,
    subjectsByForm,
    teachersBySubject,
    unavailability,
    pinnedAssignments,
    config: resolvedConfig,
    preferences,
  });

  // A short natural-language summary from Gemini, on top of the guaranteed
  // conflict-free schedule above — purely explanatory, never something the
  // schedule's validity depends on. If it fails, the draft is still fully
  // usable; the Principal just doesn't get the note.
  let aiNotes: string | null = null;
  let aiNotesError: string | null = null;
  try {
    const constraintSummaries = constraints
      .map((c) => (c.parsed as ParsedConstraint | null)?.summary)
      .filter(Boolean);
    const notesPrompt = `A school timetable was just generated for ${classesRaw.length} class(es). ${
      result.warnings.length > 0
        ? `${result.warnings.length} item(s) couldn't be fully scheduled: ${result.warnings.join(" ")}`
        : "Everything requested was scheduled successfully."
    } ${
      constraintSummaries.length > 0
        ? `The Principal's standing instructions were: ${constraintSummaries.join("; ")}.`
        : ""
    }
Write 2-3 short, friendly sentences for the Principal summarizing this outcome and, if anything was left unscheduled, one concrete suggestion to fix it (e.g. assign another teacher to a subject, add more teachers, raise the daily lesson cap). Plain text, no markdown.`;
    aiNotes = await callGemini(user.schoolId, notesPrompt, { temperature: 0.5, timeoutMs: 10000 });
  } catch (e) {
    aiNotesError = e instanceof AiServiceError ? e.message : "AI notes unavailable right now.";
  }

  const classesById = new Map(classesRaw.map((c) => [c.id, c]));
  const subjectsById = new Map(subjectsRaw.map((s) => [s.id, s]));

  return NextResponse.json({
    slots: result.slots.map((s) => ({
      ...s,
      className: classesById.get(s.classId)?.name,
      subjectCode: subjectsById.get(s.subjectId)?.code,
    })),
    warnings: result.warnings,
    aiNotes,
    aiNotesError,
  });
}
