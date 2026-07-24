/**
 * src/lib/soma-ai/intelligence.ts
 *
 * Per-module Bidii data resolvers for Soma AI.
 *
 * Each resolver:
 *   1. Accepts a UserScope from permissions.ts — never fetches without it
 *   2. Applies the scope's studentIds / classIds as WHERE filters
 *   3. Returns formatted markdown text ready for the SSE stream
 *   4. Never returns raw PII outside the authenticated user's scope
 *
 * Resolver catalogue:
 *   resolveAttendance()       — attendance for scoped students/classes
 *   resolveMarks()            — assessment results for scoped students
 *   resolveTimetable()        — timetable for scoped classes/teacher
 *   resolveLibrary()          — library card + borrows for scoped students
 *   resolveDiscipline()       — discipline records for scoped students
 *   resolveReportRemarks()    — report remarks for scoped students
 *   resolveSchoolSummary()    — school-wide summary (admin only)
 *   resolveChildrenOverview() — parent: overview of all linked children
 */

import { prisma } from "@/lib/prisma";
import type { UserScope } from "./permissions";
import { buildDenialMessage } from "./permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "N/A";
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface AttendanceOptions {
  days?: number;       // lookback window (default 30)
  studentId?: string;  // filter to single student
  classId?: string;    // filter to single class
}

export async function resolveAttendance(
  scope: UserScope,
  opts: AttendanceOptions = {}
): Promise<string> {
  if (scope.studentIds.length === 0 && scope.classIds.length === 0) {
    return buildDenialMessage("attendance records");
  }

  // If a specific student was requested, verify scope
  if (opts.studentId && !scope.studentIds.includes(opts.studentId) && !scope.isAdmin) {
    return buildDenialMessage("that student's attendance");
  }

  const days = opts.days ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const studentFilter = opts.studentId
    ? { studentId: opts.studentId }
    : scope.isAdmin
      ? {}
      : { studentId: { in: scope.studentIds } };

  const classFilter = opts.classId
    ? { classId: opts.classId }
    : {};

  const records = await prisma.attendance.findMany({
    where: {
      schoolId: scope.schoolId,
      date: { gte: since },
      ...studentFilter,
      ...classFilter,
    },
    include: {
      student: { select: { fullName: true, admissionNumber: true } },
      schoolClass: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  if (records.length === 0) {
    return `No attendance records found for the last ${days} days.`;
  }

  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const rate = pct(present, records.length);

  // If single student
  if (opts.studentId || scope.studentIds.length === 1) {
    const student = records[0]?.student;
    const absentDates = records
      .filter((r) => r.status === "ABSENT")
      .slice(0, 10)
      .map((r) => `  • ${fmtDate(r.date)}`)
      .join("\n");

    return (
      `**Attendance for ${student?.fullName ?? "this student"} — last ${days} days**\n\n` +
      `**${present}** present · **${absent}** absent · **${rate}** attendance rate\n\n` +
      (absent > 0
        ? `**Absent dates:**\n${absentDates}${absent > 10 ? `\n  … and ${absent - 10} more` : ""}`
        : "**Perfect attendance in this period.**")
    );
  }

  // Multi-student / class view
  const byStudent = new Map<string, { name: string; present: number; absent: number }>();
  for (const r of records) {
    const cur = byStudent.get(r.studentId) ?? { name: r.student.fullName, present: 0, absent: 0 };
    if (r.status === "PRESENT") cur.present++;
    else cur.absent++;
    byStudent.set(r.studentId, cur);
  }

  const topAbsent = Array.from(byStudent.values())
    .sort((a, b) => b.absent - a.absent)
    .slice(0, 10)
    .map((s) => {
      const total = s.present + s.absent;
      return `  • **${s.name}**: ${s.absent} absent / ${total} days (${pct(s.present, total)})`;
    })
    .join("\n");

  return (
    `**Attendance summary — last ${days} days**\n\n` +
    `Overall: **${present}** present · **${absent}** absent · **${rate}** rate\n\n` +
    `**Most frequent absences:**\n${topAbsent}`
  );
}

// ---------------------------------------------------------------------------
// Marks / Assessment Results
// ---------------------------------------------------------------------------

export interface MarksOptions {
  studentId?: string;
  periodId?: string;
  subjectId?: string;
}

export async function resolveMarks(
  scope: UserScope,
  opts: MarksOptions = {}
): Promise<string> {
  if (scope.studentIds.length === 0) {
    return buildDenialMessage("assessment results");
  }

  if (opts.studentId && !scope.studentIds.includes(opts.studentId) && !scope.isAdmin) {
    return buildDenialMessage("that student's results");
  }

  // Find current period if none specified
  let periodId = opts.periodId;
  if (!periodId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { id: true, name: true },
    }) as { id: string; name: string } | null;
    periodId = current?.id ?? undefined;
  }

  if (!periodId) {
    return "No active assessment period found. Ask the principal to set one as current.";
  }

  const items = await prisma.assessmentItem.findMany({
    where: {
      schoolId: scope.schoolId,
      periodId,
      studentId: opts.studentId
        ? opts.studentId
        : { in: scope.studentIds },
      ...(opts.subjectId ? { subjectId: opts.subjectId } : {}),
    },
    include: {
      student: { select: { fullName: true, admissionNumber: true } },
      subject: { select: { name: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { subject: { name: "asc" } }],
    take: 200,
  });

  if (items.length === 0) {
    return "No assessment results found for the current period.";
  }

  // Single student
  if (opts.studentId || scope.studentIds.length === 1) {
    const studentName = items[0]?.student.fullName ?? "this student";
    const bySubject = new Map<string, number[]>();
    for (const item of items) {
      const name = item.subject?.name ?? "Unknown";
      if (item.numericScore !== null && item.numericScore !== undefined) {
        const arr = bySubject.get(name) ?? [];
        arr.push(item.numericScore);
        bySubject.set(name, arr);
      }
    }

    const rows = Array.from(bySubject.entries()).map(([subj, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return `  • **${subj}**: ${avg.toFixed(1)}`;
    });

    return (
      `**Results for ${studentName} — current period**\n\n` +
      (rows.length > 0
        ? rows.join("\n")
        : "No numeric scores recorded yet for this period.")
    );
  }

  // Class/multi-student view — aggregate per subject
  const bySubject = new Map<string, number[]>();
  for (const item of items) {
    const name = item.subject?.name ?? "Unknown";
    if (item.numericScore !== null && item.numericScore !== undefined) {
      const arr = bySubject.get(name) ?? [];
      arr.push(item.numericScore);
      bySubject.set(name, arr);
    }
  }

  const rows = Array.from(bySubject.entries()).map(([subj, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    return `  • **${subj}**: avg ${avg.toFixed(1)} | range ${min}–${max} (${scores.length} students)`;
  });

  return (
    `**Class results summary — current period**\n\n` +
    (rows.length > 0 ? rows.join("\n") : "No numeric scores recorded yet.")
  );
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

export async function resolveTimetable(
  scope: UserScope,
  opts: { classId?: string; dayOfWeek?: number } = {}
): Promise<string> {
  if (scope.classIds.length === 0 && !scope.teacherId) {
    return buildDenialMessage("timetable information");
  }

  const classFilter = opts.classId
    ? { classId: opts.classId }
    : scope.teacherId
      ? { teacherId: scope.teacherId }
      : { classId: { in: scope.classIds } };

  const dayFilter = opts.dayOfWeek !== undefined
    ? { dayOfWeek: opts.dayOfWeek }
    : {};

  const slots = await prisma.timetableSlot.findMany({
    where: {
      schoolId: scope.schoolId,
      ...classFilter,
      ...dayFilter,
    },
    include: {
      subject: { select: { name: true } },
      schoolClass: { select: { name: true } },
      teacher: { select: { fullName: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  if (slots.length === 0) {
    return "No timetable slots found. The timetable may not have been configured yet.";
  }

  // Group by day
  const byDay = new Map<number, typeof slots>();
  for (const slot of slots) {
    const arr = byDay.get(slot.dayOfWeek) ?? [];
    arr.push(slot);
    byDay.set(slot.dayOfWeek, arr);
  }

  const lines: string[] = [];
  for (const [day, daySlots] of Array.from(byDay.entries()).sort(([a], [b]) => a - b)) {
    lines.push(`\n**${DAY_NAMES[day] ?? `Day ${day}`}**`);
    for (const s of daySlots.sort((a, b) => a.period - b.period)) {
      const classLabel = scope.teacherId ? ` (${s.schoolClass.name})` : "";
      const teacherLabel = !scope.teacherId && s.teacher ? ` — ${s.teacher.fullName}` : "";
      lines.push(`  Period ${s.period}: ${s.subject.name}${classLabel}${teacherLabel}${s.room ? ` [${s.room}]` : ""}`);
    }
  }

  const header = scope.teacherId
    ? "**Your teaching timetable**"
    : `**Timetable for ${slots[0]?.schoolClass.name ?? "class"}**`;

  return `${header}\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export async function resolveLibrary(
  scope: UserScope,
  opts: { studentId?: string } = {}
): Promise<string> {
  if (scope.studentIds.length === 0) {
    return buildDenialMessage("library records");
  }

  const targetIds = opts.studentId
    ? (scope.studentIds.includes(opts.studentId) || scope.isAdmin
        ? [opts.studentId]
        : null)
    : scope.studentIds;

  if (!targetIds) return buildDenialMessage("that student's library records");

  // Use `prisma as any` to avoid Prisma client type drift when schema
  // migrations for library Stage 2 haven't been applied to the local client yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const cards = await db.libraryCard.findMany({
    where: {
      schoolId: scope.schoolId,
      studentId: { in: targetIds },
    },
    include: {
      student: { select: { fullName: true, admissionNumber: true } },
      borrows: {
        where: { returnedAt: null },
        include: { book: { select: { title: true } } },
        orderBy: { dueAt: "asc" },
        take: 10,
      },
    },
  }) as Array<{
    id: string;
    status: string;
    fineBalance: number;
    currentBorrowCount: number;
    student: { fullName: string; admissionNumber: string };
    borrows: Array<{
      dueAt: Date;
      book: { title: string } | null;
    }>;
  }>;

  if (cards.length === 0) {
    return "No library cards found for the selected student(s).";
  }

  const sections: string[] = [];
  for (const card of cards) {
    const statusLabel = card.status === "ACTIVE" ? "Active" : card.status === "SUSPENDED" ? "Suspended" : String(card.status);
    const fine = card.fineBalance > 0 ? ` · Fine: KES ${card.fineBalance.toFixed(2)}` : "";
    sections.push(`**${card.student.fullName}** (${card.student.admissionNumber})`);
    sections.push(`  Status: ${statusLabel} · ${card.currentBorrowCount} book(s) out${fine}`);

    if (card.borrows.length > 0) {
      sections.push("  **Currently borrowed:**");
      for (const b of card.borrows) {
        const due = fmtDate(b.dueAt);
        const overdue = new Date(b.dueAt) < new Date() ? " ⚠️ OVERDUE" : "";
        sections.push(`    • ${b.book?.title ?? "Unknown book"} — due ${due}${overdue}`);
      }
    } else {
      sections.push("  No books currently borrowed.");
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Discipline
// ---------------------------------------------------------------------------

export async function resolveDiscipline(
  scope: UserScope,
  opts: { studentId?: string; limit?: number } = {}
): Promise<string> {
  // Discipline is sensitive — only admin/teacher/self can see
  if (!scope.isAdmin && scope.role !== "TEACHER" && scope.role !== "PARENT" && scope.role !== "STUDENT") {
    return buildDenialMessage("discipline records");
  }

  if (scope.studentIds.length === 0) return buildDenialMessage("discipline records");

  if (opts.studentId && !scope.studentIds.includes(opts.studentId) && !scope.isAdmin) {
    return buildDenialMessage("that student's discipline records");
  }

  const records = await prisma.disciplineRecord.findMany({
    where: {
      schoolId: scope.schoolId,
      studentId: opts.studentId
        ? opts.studentId
        : { in: scope.studentIds },
    },
    include: {
      student: { select: { fullName: true } },
    },
    orderBy: { dateOfOffence: "desc" },
    take: opts.limit ?? 10,
  });

  if (records.length === 0) {
    return "No discipline records found.";
  }

  const lines = records.map((r) => {
    const statusLabel = r.status === "OPEN" ? "Open" : r.status === "RESOLVED" ? "Resolved" : r.status;
    return (
      `• **${r.student.fullName}** — ${r.offence} (${fmtDate(r.dateOfOffence)}) · ${statusLabel}` +
      (r.actionTaken ? `\n  Action: ${r.actionTaken}` : "")
    );
  });

  return `**Discipline records:**\n\n${lines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Report Remarks
// ---------------------------------------------------------------------------

export async function resolveReportRemarks(
  scope: UserScope,
  opts: { studentId?: string; periodId?: string } = {}
): Promise<string> {
  if (scope.studentIds.length === 0) return buildDenialMessage("report remarks");

  if (opts.studentId && !scope.studentIds.includes(opts.studentId) && !scope.isAdmin) {
    return buildDenialMessage("that student's report remark");
  }

  // Current period if none given
  let periodId = opts.periodId;
  if (!periodId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { id: true },
    }) as { id: string } | null;
    periodId = current?.id ?? undefined;
  }

  if (!periodId) return "No active assessment period found.";

  const remarks = await prisma.reportRemark.findMany({
    where: {
      schoolId: scope.schoolId,
      periodId,
      studentId: opts.studentId
        ? opts.studentId
        : { in: scope.studentIds },
    },
    include: {
      student: { select: { fullName: true } },
    },
    orderBy: { student: { fullName: "asc" } },
    take: 20,
  });

  if (remarks.length === 0) {
    return "No report remarks found for the current period.";
  }

  const lines = remarks.map((r) => {
    const text = r.editedRemark ?? r.draftRemark ?? "No remark yet";
    const tag = r.isAiGenerated && !r.editedRemark ? " *(AI draft)*" : "";
    return `**${r.student.fullName}**${tag}\n  "${text}"`;
  });

  return `**Report remarks — current period:**\n\n${lines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Parent: Children Overview
// ---------------------------------------------------------------------------

export async function resolveChildrenOverview(scope: UserScope): Promise<string> {
  if (scope.role !== "PARENT" && scope.role !== "STUDENT") {
    return buildDenialMessage("children's records");
  }
  if (scope.studentIds.length === 0) {
    return "No children are linked to your account. Please contact the school office to link your child.";
  }

  // Fetch students with their class only (safe typed query)
  const students = await prisma.student.findMany({
    where: { id: { in: scope.studentIds } },
    select: {
      id: true,
      fullName: true,
      classId: true,
      schoolClass: { select: { name: true, form: true } },
    },
  });

  // Fetch attendance in a separate query
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const attendances = await prisma.attendance.findMany({
    where: {
      studentId: { in: scope.studentIds },
      date: { gte: thirtyDaysAgo },
    },
    select: { studentId: true, status: true },
  });

  // Fetch library cards separately (use `any` cast for Stage-2 fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libraryCards = await (prisma as any).libraryCard.findMany({
    where: { studentId: { in: scope.studentIds } },
    select: { studentId: true, fineBalance: true, currentBorrowCount: true, status: true },
  }) as Array<{ studentId: string; fineBalance: number; currentBorrowCount: number; status: string }>;

  // Build lookup maps
  const attByStudent = new Map<string, { present: number; total: number }>();
  for (const a of attendances) {
    const cur = attByStudent.get(a.studentId) ?? { present: 0, total: 0 };
    cur.total++;
    if (a.status === "PRESENT") cur.present++;
    attByStudent.set(a.studentId, cur);
  }
  const cardByStudent = new Map(libraryCards.map((c) => [c.studentId, c]));

  const sections: string[] = [`**Your children (${students.length}):**\n`];
  for (const s of students) {
    const att = attByStudent.get(s.id);
    const attRate = att && att.total > 0 ? ` · Attendance: ${pct(att.present, att.total)} (last 30 days)` : "";
    const card = cardByStudent.get(s.id);
    const libInfo = card
      ? ` · Library: ${card.currentBorrowCount} book(s) out${card.fineBalance > 0 ? ` · Fine: KES ${card.fineBalance.toFixed(2)}` : ""}`
      : "";
    sections.push(`**${s.fullName}** — ${s.schoolClass.name}${attRate}${libInfo}`);
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// School Summary (admin only)
// ---------------------------------------------------------------------------

export async function resolveSchoolSummary(scope: UserScope): Promise<string> {
  if (!scope.isAdmin) return buildDenialMessage("school-wide summary data");

  const [
    studentCount,
    teacherCount,
    classCount,
    absentToday,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId: scope.schoolId, archivedAt: null } }),
    prisma.teacher.count({ where: { schoolId: scope.schoolId } }),
    prisma.schoolClass.count({ where: { schoolId: scope.schoolId } }),
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      return prisma.attendance.count({
        where: {
          schoolId: scope.schoolId,
          date: { gte: today, lt: tomorrow },
          status: "ABSENT",
        },
      });
    })(),
  ]);

  return (
    `**School summary**\n\n` +
    `  • Students enrolled: **${studentCount}**\n` +
    `  • Teachers: **${teacherCount}**\n` +
    `  • Classes: **${classCount}**\n` +
    `  • Absent today: **${absentToday}**`
  );
}

// ---------------------------------------------------------------------------
// buildLiveContext — compact snapshot injected into every Gemini request
// ---------------------------------------------------------------------------

/**
 * Fetches a concise, scoped snapshot of live school data and returns it as
 * a markdown string. This is injected into the Gemini system prompt so the
 * model can answer data questions directly from real facts instead of
 * deflecting the user to check Analytics manually.
 *
 * Designed to be fast (<200ms): all queries run in parallel and are capped
 * at small limits. Non-fatal errors in individual sections are swallowed so
 * a partial outage never blocks the whole response.
 */
export async function buildLiveContext(scope: UserScope): Promise<string> {
  const sections: string[] = [];

  try {
    // ── 1. School / scope header ──────────────────────────────────────────
    const [studentCount, classCount, teacherCount] = await Promise.all([
      scope.isAdmin
        ? prisma.student.count({ where: { schoolId: scope.schoolId, archivedAt: null } })
        : Promise.resolve(scope.studentIds.length),
      prisma.schoolClass.count({ where: { schoolId: scope.schoolId } }),
      scope.isAdmin
        ? prisma.teacher.count({ where: { schoolId: scope.schoolId } })
        : Promise.resolve(null),
    ]);

    const schoolHeader = scope.isAdmin
      ? `Students enrolled: **${studentCount}** · Classes: **${classCount}** · Teachers: **${teacherCount}**`
      : `Students in your scope: **${studentCount}** · Classes: **${classCount}**`;
    sections.push(`### School Overview\n${schoolHeader}`);
  } catch { /* non-fatal */ }

  try {
    // ── 2. Today's attendance ─────────────────────────────────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const todayFilter = scope.isAdmin
      ? { schoolId: scope.schoolId, date: { gte: today, lt: tomorrow } }
      : {
          schoolId: scope.schoolId,
          date: { gte: today, lt: tomorrow },
          studentId: { in: scope.studentIds },
        };

    const todayRecords = await prisma.attendance.findMany({
      where: todayFilter,
      select: { status: true, student: { select: { fullName: true, admissionNumber: true } }, schoolClass: { select: { name: true } } },
      take: 300,
    });

    if (todayRecords.length > 0) {
      const present = todayRecords.filter((r) => r.status === "PRESENT").length;
      const absent = todayRecords.filter((r) => r.status === "ABSENT").length;
      const rate = Math.round((present / todayRecords.length) * 100);
      const absentList = todayRecords
        .filter((r) => r.status === "ABSENT")
        .slice(0, 15)
        .map((r) => `${r.student.fullName} (${r.schoolClass.name})`)
        .join(", ");
      sections.push(
        `### Today's Attendance\nPresent: **${present}** · Absent: **${absent}** · Rate: **${rate}%**` +
        (absent > 0 ? `\nAbsent: ${absentList}${absent > 15 ? ` … and ${absent - 15} more` : ""}` : "\nAll students present.")
      );
    } else {
      sections.push(`### Today's Attendance\nNo attendance marked yet for today.`);
    }
  } catch { /* non-fatal */ }

  try {
    // ── 3. Current assessment period + class means ────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentPeriod = await (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as { id: string; name: string; academicYear: string; term: number | null } | null;

    if (currentPeriod) {
      const classFilter = scope.isAdmin
        ? { schoolId: scope.schoolId, periodId: currentPeriod.id }
        : { schoolId: scope.schoolId, periodId: currentPeriod.id, studentId: { in: scope.studentIds } };

      const items = await prisma.assessmentItem.findMany({
        where: classFilter,
        select: {
          numericScore: true,
          student: {
            select: {
              fullName: true,
              admissionNumber: true,
              schoolClass: { select: { name: true } },
            },
          },
          subject: { select: { name: true } },
        },
        take: 500,
      });

      if (items.length > 0) {
        // Subject means
        const bySubject = new Map<string, number[]>();
        for (const item of items) {
          if (item.numericScore == null) continue;
          const name = item.subject?.name ?? "Unknown";
          const arr = bySubject.get(name) ?? [];
          arr.push(item.numericScore);
          bySubject.set(name, arr);
        }

        const subjectLines = Array.from(bySubject.entries())
          .sort(([, a], [, b]) => {
            const avgA = a.reduce((x, y) => x + y, 0) / a.length;
            const avgB = b.reduce((x, y) => x + y, 0) / b.length;
            return avgB - avgA;
          })
          .map(([subj, scores]) => {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const min = Math.min(...scores);
            const max = Math.max(...scores);
            return `${subj}: avg **${avg.toFixed(1)}** (range ${min}–${max}, n=${scores.length})`;
          })
          .join(" · ");

        // Class means (admin only, cap at 8 classes) — derived from student.schoolClass
        let classMeansText = "";
        if (scope.isAdmin) {
          const byClass = new Map<string, number[]>();
          for (const item of items) {
            if (item.numericScore == null) continue;
            const className = item.student.schoolClass?.name;
            if (!className) continue;
            const arr = byClass.get(className) ?? [];
            arr.push(item.numericScore);
            byClass.set(className, arr);
          }
          const classMeans = Array.from(byClass.entries())
            .map(([cls, scores]) => ({ cls, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8)
            .map(({ cls, avg }) => `${cls}: **${avg.toFixed(1)}**`)
            .join(" · ");
          if (classMeans) classMeansText = `\nClass means: ${classMeans}`;
        }

        sections.push(
          `### Current Assessment Period: ${currentPeriod.name} (${currentPeriod.academicYear}${currentPeriod.term ? ` · Term ${currentPeriod.term}` : ""})\n` +
          `Subject averages: ${subjectLines}${classMeansText}`
        );
      } else {
        sections.push(`### Current Assessment Period: ${currentPeriod.name}\nNo marks entered yet.`);
      }
    } else {
      sections.push(`### Assessment\nNo current assessment period is set.`);
    }
  } catch { /* non-fatal */ }

  try {
    // ── 4. 30-day attendance trend (absence rate per class or for scoped students)
    const since = new Date(); since.setDate(since.getDate() - 30);
    const trendFilter = scope.isAdmin
      ? { schoolId: scope.schoolId, date: { gte: since } }
      : { schoolId: scope.schoolId, date: { gte: since }, studentId: { in: scope.studentIds } };

    const trendRecords = await prisma.attendance.findMany({
      where: trendFilter,
      select: { status: true, schoolClass: { select: { name: true } } },
      take: 2000,
    });

    if (trendRecords.length > 0) {
      const present = trendRecords.filter((r) => r.status === "PRESENT").length;
      const absent = trendRecords.filter((r) => r.status === "ABSENT").length;
      const rate30 = Math.round((present / trendRecords.length) * 100);

      // Per-class breakdown (cap at 6 classes for brevity)
      const byClass = new Map<string, { present: number; absent: number }>();
      for (const r of trendRecords) {
        const cls = r.schoolClass?.name ?? "Unknown";
        const cur = byClass.get(cls) ?? { present: 0, absent: 0 };
        if (r.status === "PRESENT") cur.present++; else cur.absent++;
        byClass.set(cls, cur);
      }
      const classLines = Array.from(byClass.entries())
        .sort(([, a], [, b]) => {
          const rateA = a.present / (a.present + a.absent);
          const rateB = b.present / (b.present + b.absent);
          return rateA - rateB; // lowest rate first (most concerning)
        })
        .slice(0, 6)
        .map(([cls, v]) => {
          const total = v.present + v.absent;
          return `${cls}: ${Math.round((v.present / total) * 100)}%`;
        })
        .join(" · ");

      sections.push(
        `### Last 30 Days Attendance Trend\nOverall: **${rate30}%** (${present} present / ${absent} absent)` +
        (classLines ? `\nBy class (lowest first): ${classLines}` : "")
      );
    }
  } catch { /* non-fatal */ }

  try {
    // ── 5. For teachers/parents: scoped student marks summary ────────────
    if (!scope.isAdmin && scope.studentIds.length > 0 && scope.studentIds.length <= 50) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentPeriod = await (prisma as any).assessmentPeriod.findFirst({
        where: { schoolId: scope.schoolId, isCurrent: true },
        select: { id: true, name: true },
      }) as { id: string; name: string } | null;

      if (currentPeriod) {
        const scopedItems = await prisma.assessmentItem.findMany({
          where: {
            schoolId: scope.schoolId,
            periodId: currentPeriod.id,
            studentId: { in: scope.studentIds },
          },
          select: {
            numericScore: true,
            student: { select: { fullName: true } },
            subject: { select: { name: true } },
          },
          take: 200,
        });

        if (scopedItems.length > 0) {
          // Group by student
          const byStudent = new Map<string, { name: string; scores: { subject: string; score: number }[] }>();
          for (const item of scopedItems) {
            if (item.numericScore == null) continue;
            const sid = item.student.fullName;
            const cur = byStudent.get(sid) ?? { name: item.student.fullName, scores: [] };
            cur.scores.push({ subject: item.subject?.name ?? "Unknown", score: item.numericScore });
            byStudent.set(sid, cur);
          }

          const studentLines = Array.from(byStudent.values())
            .slice(0, 10)
            .map(({ name, scores }) => {
              const avg = scores.reduce((a, b) => a + b.score, 0) / scores.length;
              const subjectBreakdown = scores.map((s) => `${s.subject}: ${s.score}`).join(", ");
              return `**${name}**: avg ${avg.toFixed(1)} (${subjectBreakdown})`;
            })
            .join("\n");

          sections.push(`### Your Students' Results (${currentPeriod.name})\n${studentLines}`);
        }
      }
    }
  } catch { /* non-fatal */ }

  if (sections.length === 0) {
    return "";
  }

  return (
    `\n\n---\n## Live School Data (fetched ${new Date().toLocaleTimeString("en-KE")})\n` +
    `*The following is live data from the Bidii database — use it to answer the user directly.*\n\n` +
    sections.join("\n\n")
  );
}
