/**
 * src/lib/library/policyEngine.ts
 *
 * Server-side Library Policy Engine.
 *
 * Evaluates whether a circulation action is permitted based on the patron's
 * applicable LibraryPolicy, their current card state, and any active fine
 * pauses. All logic lives here so every API route shares a single, testable
 * source of truth.
 *
 * Usage:
 *   const engine = await PolicyEngine.load(schoolId);
 *   const result = engine.evaluateBorrow({ card, copy, patronType });
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRow {
  id: string;
  patronType: string;
  maxBooksAllowed: number;
  borrowDays: number;
  gracePeriodDays: number;
  finePerDay: number;
  countWeekends: boolean;
  countHolidays: boolean;
  maxRenewals: number;
  fineBlockThreshold: number;
  lostBookMultiplier: number;
  lostBookFixedFee: number;
  damagedBookFineRate: number;
  reservationsAllowed: boolean;
  isActive: boolean;
}

export interface EvalResult {
  allowed: boolean;
  /** Array of block reasons — non-empty means borrowing is blocked. */
  reasons: string[];
  /** Soft warnings that don't block but should be shown. */
  warnings: string[];
  policy: PolicyRow;
  dueAt: Date;
  finePaused: boolean;
}

export interface BorrowEvalParams {
  card: {
    id: string;
    studentId: string;
    status: string;
    fineBalance: number;
    currentBorrowCount: number;
    expiresAt?: Date | string | null;
  };
  copy: {
    status: string;
    catalogueId: string;
    archivedAt?: Date | null;
  };
  patronType?: string;
  /** Active (unreturned) borrow count for the card — used as cross-check */
  activeBorrowCount?: number;
  /** Any pending/active reservation for this catalogue entry owned by this student */
  hasReservationForCopy?: boolean;
}

// ---------------------------------------------------------------------------
// Fine calculation helpers
// ---------------------------------------------------------------------------

/**
 * Compute overdue fine for a borrow, respecting the policy's countWeekends
 * and gracePeriodDays settings.
 */
export function computeFine(params: {
  dueAt: Date;
  endDate: Date;   // fineStoppedAt ?? returnedAt ?? now
  policy: PolicyRow;
}): number {
  const { dueAt, endDate, policy } = params;

  const effectiveStart = new Date(dueAt);
  effectiveStart.setDate(effectiveStart.getDate() + (policy.gracePeriodDays ?? 0));

  if (endDate <= effectiveStart) return 0;

  if (policy.countWeekends) {
    const msOverdue = Math.max(0, endDate.getTime() - effectiveStart.getTime());
    const daysOverdue = Math.floor(msOverdue / 86_400_000);
    return daysOverdue * policy.finePerDay;
  }

  // Count only weekdays
  let days = 0;
  const cursor = new Date(effectiveStart);
  while (cursor < endDate) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days * policy.finePerDay;
}

// ---------------------------------------------------------------------------
// PolicyEngine class
// ---------------------------------------------------------------------------

export class PolicyEngine {
  private policies: PolicyRow[];
  private pauseActive: boolean;
  private pauseStudents: Set<string>;

  private constructor(
    policies: PolicyRow[],
    pauseActive: boolean,
    pauseStudents: Set<string>
  ) {
    this.policies      = policies;
    this.pauseActive   = pauseActive;
    this.pauseStudents = pauseStudents;
  }

  /** Load the engine for a school — single DB call fetches all policies + pauses. */
  static async load(schoolId: string): Promise<PolicyEngine> {
    const now = new Date();
    const [policies, pauses] = await Promise.all([
      prisma.libraryPolicy.findMany({
        where: { schoolId, isActive: true },
      }),
      prisma.libraryFinePause.findMany({
        where: {
          schoolId,
          isActive: true,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPauses = pauses as any[];
    const schoolWidePaused = rawPauses.some((p) => p.scope === "SCHOOL_WIDE");
    const pausedStudents   = new Set<string>(
      rawPauses
        .filter((p) => p.scope === "STUDENT" && p.studentId)
        .map((p) => p.studentId as string)
    );

    return new PolicyEngine(policies as PolicyRow[], schoolWidePaused, pausedStudents);
  }

  /** Return the most specific applicable policy for a patron type. */
  policyFor(patronType = "DEFAULT"): PolicyRow {
    const specific = this.policies.find((p) => p.patronType === patronType);
    if (specific) return specific;
    const def = this.policies.find((p) => p.patronType === "DEFAULT");
    if (def) return def;
    // Hardcoded fallback — no policy row exists yet
    return {
      id: "fallback",
      patronType: "DEFAULT",
      maxBooksAllowed: 3,
      borrowDays: 14,
      gracePeriodDays: 0,
      finePerDay: 5,
      countWeekends: true,
      countHolidays: false,
      maxRenewals: 1,
      fineBlockThreshold: 0,
      lostBookMultiplier: 1,
      lostBookFixedFee: 500,
      damagedBookFineRate: 0.3,
      reservationsAllowed: true,
      isActive: true,
    };
  }

  isFinePaused(studentId: string): boolean {
    return this.pauseActive || this.pauseStudents.has(studentId);
  }

  /** Full borrowing eligibility evaluation. */
  evaluateBorrow(params: BorrowEvalParams): EvalResult {
    const { card, copy, patronType = "DEFAULT", hasReservationForCopy } = params;
    const policy    = this.policyFor(patronType);
    const reasons:  string[] = [];
    const warnings: string[] = [];
    const finePaused = this.isFinePaused(card.studentId);

    // ── Card status ────────────────────────────────────────────────────
    if (card.status === "SUSPENDED") {
      reasons.push("Library card is suspended. Contact the librarian to reinstate.");
    } else if (card.status === "ALUMNI") {
      reasons.push("Library card is inactive (Alumni). Borrowing is not permitted.");
    } else if (card.status === "TRANSFERRED") {
      reasons.push("Library card is inactive (Transferred). Borrowing is not permitted.");
    }

    // ── Card expiry ────────────────────────────────────────────────────
    if (card.expiresAt) {
      const exp = new Date(card.expiresAt);
      if (exp < new Date()) {
        reasons.push(`Library card expired on ${exp.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}. Renew the card to borrow.`);
      } else {
        const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
        if (daysLeft <= 7) warnings.push(`Library card expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
      }
    }

    // ── Outstanding fines ──────────────────────────────────────────────
    if (!finePaused && card.fineBalance > policy.fineBlockThreshold) {
      reasons.push(
        `Outstanding fine of KES ${card.fineBalance.toFixed(2)} must be cleared before borrowing` +
        (policy.fineBlockThreshold > 0 ? ` (threshold: KES ${policy.fineBlockThreshold.toFixed(2)})` : "") + "."
      );
    } else if (!finePaused && card.fineBalance > 0) {
      warnings.push(`Student has an outstanding fine of KES ${card.fineBalance.toFixed(2)}.`);
    }

    // ── Borrowing limit ────────────────────────────────────────────────
    const activeBorrows = params.activeBorrowCount ?? card.currentBorrowCount;
    if (activeBorrows >= policy.maxBooksAllowed) {
      reasons.push(
        `Borrowing limit reached (${activeBorrows}/${policy.maxBooksAllowed}). Return a book to borrow another.`
      );
    } else if (activeBorrows === policy.maxBooksAllowed - 1) {
      warnings.push(`This will use the last borrowing slot (${activeBorrows + 1}/${policy.maxBooksAllowed}).`);
    }

    // ── Copy availability ──────────────────────────────────────────────
    if (copy.archivedAt) {
      reasons.push("This copy has been removed from circulation.");
    } else if (copy.status === "BORROWED") {
      reasons.push("This copy is currently borrowed. Choose a different copy or reserve it.");
    } else if (copy.status === "RESERVED" && !hasReservationForCopy) {
      reasons.push("This copy has been reserved for another patron.");
    } else if (copy.status === "UNDER_REPAIR") {
      reasons.push("This copy is under repair and unavailable.");
    } else if (copy.status === "ARCHIVED") {
      reasons.push("This copy is archived and cannot be borrowed.");
    }

    // ── Fine pause check ──────────────────────────────────────────────
    if (finePaused) {
      warnings.push("Fine accumulation is currently paused for this student.");
    }

    // ── Due date ───────────────────────────────────────────────────────
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + policy.borrowDays);

    return { allowed: reasons.length === 0, reasons, warnings, policy, dueAt, finePaused };
  }
}
