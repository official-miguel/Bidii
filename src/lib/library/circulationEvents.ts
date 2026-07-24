/**
 * src/lib/library/circulationEvents.ts
 *
 * Thin wrapper that writes a LibraryCirculationEvent row and emits the
 * matching SSE event. Import into any circulation API route.
 */

import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";

interface EventParams {
  schoolId:       string;
  eventType:      string;
  copyId?:        string | null;
  catalogueId?:   string | null;
  borrowId?:      string | null;
  reservationId?: string | null;
  studentId?:     string | null;
  teacherId?:     string | null;
  performedById?: string | null;
  payload?:       Record<string, unknown>;
}

export async function recordCirculationEvent(p: EventParams): Promise<void> {
  await prisma.libraryCirculationEvent.create({
    data: {
      schoolId:       p.schoolId,
      eventType:      p.eventType,
      copyId:         p.copyId ?? null,
      catalogueId:    p.catalogueId ?? null,
      borrowId:       p.borrowId ?? null,
      reservationId:  p.reservationId ?? null,
      studentId:      p.studentId ?? null,
      teacherId:      p.teacherId ?? null,
      performedById:  p.performedById ?? null,
      payload:        (p.payload ?? null) as never,
    },
  });

  emitSSE(p.schoolId, "libraryCopy.updated", {
    eventType: p.eventType,
    copyId:    p.copyId,
    catalogueId: p.catalogueId,
  });
}

/** Append a fine event to LibraryFineAudit. */
export async function recordFineAudit(params: {
  schoolId:       string;
  cardId:         string;
  borrowId?:      string | null;
  eventType:      string;
  amount:         number;
  balanceAfter:   number;
  reason?:        string | null;
  performedById?: string | null;
}): Promise<void> {
  await prisma.libraryFineAudit.create({
    data: {
      schoolId:      params.schoolId,
      cardId:        params.cardId,
      borrowId:      params.borrowId ?? null,
      eventType:     params.eventType,
      amount:        params.amount,
      balanceAfter:  params.balanceAfter,
      reason:        params.reason ?? null,
      performedById: params.performedById ?? null,
    },
  });
}
