/**
 * src/lib/timetable/sessionAllocator.ts
 *
 * Session-based lesson allocation system.
 * Divides the teaching day into morning/afternoon/evening sessions
 * and enforces subject placement into specific sessions based on
 * school configuration.
 */

import { TimetableSession } from "@prisma/client";
import type { TemplateColumn } from "./deterministicEngine";
import { getLessonColumns } from "./engineHelpers";

export type SessionConstraint = {
  subjectCode: string;
  subjectName: string;
  requiredSession: TimetableSession;
  /** Hard constraint = must be satisfied, soft = prefer but not required */
  isHard: boolean;
  reason?: string;
};

export type SessionAllocation = {
  session: TimetableSession;
  availableSlots: number;
  allocatedSlots: number;
  utilizationPercent: number;
  periods: number[];
};

export type SessionDistribution = {
  morning: SessionAllocation;
  afternoon: SessionAllocation;
  evening: SessionAllocation;
  totalSlots: number;
  balanced: boolean;
};

/**
 * Get periods belonging to a specific session
 */
export function getPeriodsInSession(
  session: TimetableSession,
  columns: TemplateColumn[]
): number[] {
  const lessonCols = getLessonColumns(columns);
  return lessonCols
    .filter((col) => col.session === session)
    .map((_, index) => index + 1);
}

/**
 * Get session for a given period number
 */
export function getSessionForPeriod(
  period: number,
  columns: TemplateColumn[]
): TimetableSession | null {
  const lessonCols = getLessonColumns(columns);
  const column = lessonCols[period - 1];
  return column?.session ?? null;
}

/**
 * Calculate session distribution for a timetable template
 */
export function calculateSessionDistribution(
  columns: TemplateColumn[],
  operatingDays: number[]
): SessionDistribution {
  const lessonCols = getLessonColumns(columns);

  const morning = lessonCols.filter((c) => c.session === TimetableSession.MORNING);
  const afternoon = lessonCols.filter((c) => c.session === TimetableSession.AFTERNOON);
  const evening = lessonCols.filter((c) => c.session === TimetableSession.EVENING);

  const totalSlots = lessonCols.length * operatingDays.length;
  const morningSlots = morning.length * operatingDays.length;
  const afternoonSlots = afternoon.length * operatingDays.length;
  const eveningSlots = evening.length * operatingDays.length;

  // Check if sessions are balanced (no session should be < 20% of total if it exists)
  const balanced =
    (morning.length === 0 || morning.length / lessonCols.length >= 0.2) &&
    (afternoon.length === 0 || afternoon.length / lessonCols.length >= 0.2) &&
    (evening.length === 0 || evening.length / lessonCols.length >= 0.2);

  return {
    morning: {
      session: TimetableSession.MORNING,
      availableSlots: morningSlots,
      allocatedSlots: 0,
      utilizationPercent: 0,
      periods: morning.map((_, i) => i + 1),
    },
    afternoon: {
      session: TimetableSession.AFTERNOON,
      availableSlots: afternoonSlots,
      allocatedSlots: 0,
      utilizationPercent: 0,
      periods: afternoon.map(
        (_, i) => morning.length + i + 1
      ),
    },
    evening: {
      session: TimetableSession.EVENING,
      availableSlots: eveningSlots,
      allocatedSlots: 0,
      utilizationPercent: 0,
      periods: evening.map(
        (_, i) => morning.length + afternoon.length + i + 1
      ),
    },
    totalSlots,
    balanced,
  };
}

/**
 * Update session distribution with allocated slots
 */
export function updateSessionDistribution(
  distribution: SessionDistribution,
  allocatedSlots: Array<{ period: number; session: TimetableSession }>
): SessionDistribution {
  const updated = { ...distribution };

  const sessionCounts = {
    MORNING: 0,
    AFTERNOON: 0,
    EVENING: 0,
  };

  for (const slot of allocatedSlots) {
    sessionCounts[slot.session]++;
  }

  updated.morning.allocatedSlots = sessionCounts.MORNING;
  updated.morning.utilizationPercent =
    updated.morning.availableSlots > 0
      ? (sessionCounts.MORNING / updated.morning.availableSlots) * 100
      : 0;

  updated.afternoon.allocatedSlots = sessionCounts.AFTERNOON;
  updated.afternoon.utilizationPercent =
    updated.afternoon.availableSlots > 0
      ? (sessionCounts.AFTERNOON / updated.afternoon.availableSlots) * 100
      : 0;

  updated.evening.allocatedSlots = sessionCounts.EVENING;
  updated.evening.utilizationPercent =
    updated.evening.availableSlots > 0
      ? (sessionCounts.EVENING / updated.evening.availableSlots) * 100
      : 0;

  return updated;
}

/**
 * Validate session constraints for generated slots
 */
export function validateSessionConstraints(
  slots: Array<{
    subjectId: string;
    subjectCode: string;
    period: number;
  }>,
  constraints: SessionConstraint[],
  columns: TemplateColumn[]
): Array<{
  constraint: SessionConstraint;
  violations: Array<{
    subjectCode: string;
    period: number;
    expectedSession: TimetableSession;
    actualSession: TimetableSession;
  }>;
}> {
  const violations: Array<{
    constraint: SessionConstraint;
    violations: Array<{
      subjectCode: string;
      period: number;
      expectedSession: TimetableSession;
      actualSession: TimetableSession;
    }>;
  }> = [];

  const constraintMap = new Map<string, SessionConstraint>();
  for (const constraint of constraints) {
    constraintMap.set(constraint.subjectCode.toUpperCase(), constraint);
  }

  for (const slot of slots) {
    const constraint = constraintMap.get(slot.subjectCode.toUpperCase());
    if (!constraint) continue;

    // Only check hard constraints
    if (!constraint.isHard) continue;

    const actualSession = getSessionForPeriod(slot.period, columns);
    if (actualSession !== constraint.requiredSession) {
      let violationEntry = violations.find((v) => v.constraint === constraint);
      if (!violationEntry) {
        violationEntry = { constraint, violations: [] };
        violations.push(violationEntry);
      }

      violationEntry.violations.push({
        subjectCode: slot.subjectCode,
        period: slot.period,
        expectedSession: constraint.requiredSession,
        actualSession: actualSession!,
      });
    }
  }

  return violations;
}

/**
 * Recommend session assignments for subjects without preferences
 */
export function recommendSessionAssignments(
  subjects: Array<{
    code: string;
    name: string;
    lessonsPerWeek: number;
  }>,
  distribution: SessionDistribution,
  existingConstraints: SessionConstraint[]
): Array<{
  subjectCode: string;
  subjectName: string;
  recommendedSession: TimetableSession;
  reason: string;
}> {
  const recommendations: Array<{
    subjectCode: string;
    subjectName: string;
    recommendedSession: TimetableSession;
    reason: string;
  }> = [];

  const constraintMap = new Map<string, SessionConstraint>();
  for (const constraint of existingConstraints) {
    constraintMap.set(constraint.subjectCode.toUpperCase(), constraint);
  }

  // Subject categorization based on cognitive load
  const heavySubjects = ["MATH", "MATHEMATICS", "PHYSICS", "CHEMISTRY", "BIOLOGY"];
  const moderateSubjects = ["ENGLISH", "KISWAHILI", "HISTORY", "GEOGRAPHY"];
  const lightSubjects = ["PE", "ART", "MUSIC", "DRAMA"];

  for (const subject of subjects) {
    // Skip if already has constraint
    if (constraintMap.has(subject.code.toUpperCase())) continue;

    const upperCode = subject.code.toUpperCase();
    const upperName = subject.name.toUpperCase();

    let recommendedSession: TimetableSession;
    let reason: string;

    // Heavy cognitive load subjects -> Morning
    if (
      heavySubjects.some((s) => upperCode.includes(s) || upperName.includes(s))
    ) {
      recommendedSession = TimetableSession.MORNING;
      reason = "High cognitive load subjects perform better in morning sessions";
    }
    // Moderate subjects -> Distribute based on availability
    else if (
      moderateSubjects.some((s) => upperCode.includes(s) || upperName.includes(s))
    ) {
      // Choose session with most availability
      if (
        distribution.morning.availableSlots > distribution.afternoon.availableSlots
      ) {
        recommendedSession = TimetableSession.MORNING;
        reason = "Morning session has more availability";
      } else {
        recommendedSession = TimetableSession.AFTERNOON;
        reason = "Afternoon session has more availability";
      }
    }
    // Light subjects -> Afternoon/Evening
    else if (
      lightSubjects.some((s) => upperCode.includes(s) || upperName.includes(s))
    ) {
      recommendedSession = TimetableSession.AFTERNOON;
      reason = "Physical/creative subjects suit afternoon sessions";
    }
    // Default: distribute based on availability
    else {
      const sessions = [
        { session: TimetableSession.MORNING, available: distribution.morning.availableSlots },
        { session: TimetableSession.AFTERNOON, available: distribution.afternoon.availableSlots },
        { session: TimetableSession.EVENING, available: distribution.evening.availableSlots },
      ];

      sessions.sort((a, b) => b.available - a.available);
      recommendedSession = sessions[0].session;
      reason = `${recommendedSession} session has most availability`;
    }

    recommendations.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      recommendedSession,
      reason,
    });
  }

  return recommendations;
}

/**
 * Check if a subject can fit in a session given capacity
 */
export function canFitInSession(
  subjectLessons: number,
  session: SessionAllocation,
  operatingDays: number[]
): boolean {
  const requiredSlotsPerDay = Math.ceil(subjectLessons / operatingDays.length);
  const periodsPerDay = Math.ceil(session.availableSlots / operatingDays.length);
  const remainingPerDay = periodsPerDay - Math.ceil(session.allocatedSlots / operatingDays.length);

  return remainingPerDay >= requiredSlotsPerDay;
}

/**
 * Analyze session capacity and warn about over-allocation
 */
export function analyzeSessionCapacity(
  requirements: Array<{
    subjectCode: string;
    lessonsPerWeek: number;
    preferredSession?: TimetableSession;
  }>,
  distribution: SessionDistribution,
  operatingDays: number[]
): {
  feasible: boolean;
  warnings: string[];
  sessionLoad: {
    morning: { required: number; available: number; overload: number };
    afternoon: { required: number; available: number; overload: number };
    evening: { required: number; available: number; overload: number };
  };
} {
  const warnings: string[] = [];

  const sessionLoad = {
    morning: { required: 0, available: distribution.morning.availableSlots, overload: 0 },
    afternoon: { required: 0, available: distribution.afternoon.availableSlots, overload: 0 },
    evening: { required: 0, available: distribution.evening.availableSlots, overload: 0 },
  };

  // Calculate required slots per session
  for (const req of requirements) {
    const totalRequired = req.lessonsPerWeek * operatingDays.length;

    if (req.preferredSession === TimetableSession.MORNING) {
      sessionLoad.morning.required += totalRequired;
    } else if (req.preferredSession === TimetableSession.AFTERNOON) {
      sessionLoad.afternoon.required += totalRequired;
    } else if (req.preferredSession === TimetableSession.EVENING) {
      sessionLoad.evening.required += totalRequired;
    } else {
      // Distribute evenly across available sessions
      const sessionsAvailable = [
        distribution.morning.availableSlots > 0,
        distribution.afternoon.availableSlots > 0,
        distribution.evening.availableSlots > 0,
      ].filter(Boolean).length;

      if (sessionsAvailable > 0) {
        const perSession = Math.ceil(totalRequired / sessionsAvailable);
        if (distribution.morning.availableSlots > 0) sessionLoad.morning.required += perSession;
        if (distribution.afternoon.availableSlots > 0) sessionLoad.afternoon.required += perSession;
        if (distribution.evening.availableSlots > 0) sessionLoad.evening.required += perSession;
      }
    }
  }

  // Check for overload
  let feasible = true;

  if (sessionLoad.morning.required > sessionLoad.morning.available) {
    sessionLoad.morning.overload = sessionLoad.morning.required - sessionLoad.morning.available;
    warnings.push(
      `Morning session overloaded by ${sessionLoad.morning.overload} slots (required: ${sessionLoad.morning.required}, available: ${sessionLoad.morning.available})`
    );
    feasible = false;
  }

  if (sessionLoad.afternoon.required > sessionLoad.afternoon.available) {
    sessionLoad.afternoon.overload = sessionLoad.afternoon.required - sessionLoad.afternoon.available;
    warnings.push(
      `Afternoon session overloaded by ${sessionLoad.afternoon.overload} slots (required: ${sessionLoad.afternoon.required}, available: ${sessionLoad.afternoon.available})`
    );
    feasible = false;
  }

  if (sessionLoad.evening.required > sessionLoad.evening.available) {
    sessionLoad.evening.overload = sessionLoad.evening.required - sessionLoad.evening.available;
    warnings.push(
      `Evening session overloaded by ${sessionLoad.evening.overload} slots (required: ${sessionLoad.evening.required}, available: ${sessionLoad.evening.available})`
    );
    feasible = false;
  }

  // Warn about underutilization
  const totalRequired = sessionLoad.morning.required + sessionLoad.afternoon.required + sessionLoad.evening.required;
  const totalAvailable = distribution.totalSlots;

  if (totalRequired < totalAvailable * 0.7) {
    warnings.push(
      `Only ${Math.round((totalRequired / totalAvailable) * 100)}% of available slots will be used. Consider reducing template size or adding subjects.`
    );
  }

  return {
    feasible,
    warnings,
    sessionLoad,
  };
}

/**
 * Get session name in human-readable format
 */
export function getSessionName(session: TimetableSession): string {
  return session.charAt(0) + session.slice(1).toLowerCase();
}

/**
 * Get session color for UI display
 */
export function getSessionColor(session: TimetableSession): string {
  switch (session) {
    case TimetableSession.MORNING:
      return "#FEF3C7"; // Light yellow
    case TimetableSession.AFTERNOON:
      return "#DBEAFE"; // Light blue
    case TimetableSession.EVENING:
      return "#E9D5FF"; // Light purple
    default:
      return "#F3F4F6"; // Gray
  }
}
