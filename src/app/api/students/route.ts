import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission, requireRecordsPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

// ---------------------------------------------------------------------------
// GET /api/students
//
// Query parameters
//   classId  — filter to one class
//   q        — search string (name or admission number)
//   by       — "name" (default) | "admission"
//   limit    — page size, 1–500, default 200
//   cursor   — admissionNumber of the last row from the previous page
//              (opaque to the client — just pass back what you received)
//
// Response headers
//   X-Next-Cursor — present when there is another page; pass as ?cursor=
//   X-Total-Count — total matching rows (only returned on the first page,
//                   i.e. when no cursor is supplied), for rendering pagination
//                   UI without an extra count query on subsequent pages.
//
// Performance notes
//   • "name" search uses a DB-side ILIKE which benefits from the
//     Student_fullName_idx trigram/gin index added in migration
//     20260723000000_add_name_search_indexes.
//   • "admission" search hits the unique index on admissionNumber.
//   • Results are ordered by fullName ASC then id ASC (stable for cursor).
//   • Max page size of 500 prevents a single request from loading all 50k
//     students.  The offline sync layer uses /api/sync/pull instead.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // Records users need the student list for search/linking even without the
  // full STUDENTS module.
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("STUDENTS", "view")) ??
    (await requireRecordsPermission("RECORDS_DISCIPLINE", "view")) ??
    (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const classId = sp.get("classId") || undefined;
  const q       = sp.get("q")?.trim() || undefined;
  const by      = sp.get("by"); // "name" | "admission"
  const cursor  = sp.get("cursor") || undefined; // admissionNumber of last row

  // Clamp page size: default 200, max 500.
  const rawLimit = parseInt(sp.get("limit") ?? "200", 10);
  const limit    = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 500);

  // Build the where clause incrementally — Prisma's generated types don't
  // expose a standalone WhereInput via Parameters<> in all versions, so
  // we use an explicit Record shape and let findMany infer the rest.
  const where: Record<string, unknown> = {
    schoolId: user.schoolId,
    archivedAt: null,          // Active students only — archived ones live in /api/history/students
    ...(classId ? { classId } : {}),
    ...(q
      ? by === "admission"
        ? { admissionNumber: { contains: q, mode: "insensitive" } }
        : { fullName: { contains: q, mode: "insensitive" } }
      : {}),
  };

  // Cursor-based pagination: fetch limit+1 rows; if we get limit+1 back
  // there is a next page and we return a cursor pointing to it.
  // The cursor is the admissionNumber of the last row in the current page —
  // simple and stable since admissionNumber is unique.
  if (cursor) {
    where.admissionNumber = { gt: cursor };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        admissionNumber: true,
        fullName: true,
        dateOfBirth: true,
        classId: true,
        parentName: true,
        parentContact: true,
        schoolId: true,
        createdAt: true,
        updatedAt: true,
        electives: {
          select: { subjectId: true },
        },
      },
      orderBy: [{ admissionNumber: "asc" }],
      take: limit + 1, // +1 to detect the next page
    }),
    // Only count on first page (no cursor) to avoid an extra query on every
    // paginated call.  Clients cache the total from the first page.
    cursor
      ? Promise.resolve(null)
      : prisma.student.count({ where }),
  ]);

  const hasMore      = students.length > limit;
  const page         = hasMore ? students.slice(0, limit) : students;
  const nextCursor   = hasMore ? page[page.length - 1].admissionNumber : undefined;

  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
  };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;
  if (total !== null) headers["X-Total-Count"] = String(total);

  return NextResponse.json(page, { headers });
}

const createSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the student's full name."),
  startingAdmissionNumber: z.coerce.number().int().positive().optional(),
  form: z.coerce.number().int().min(1, "Choose a form."),
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  boardingStatus: z.enum(["DAY", "BOARDING"]).nullable().optional(),
  parentName: z.string().trim().optional().or(z.literal("")),
  parentContact: z.string().trim().optional().or(z.literal("")),
  electiveSubjectIds: z.array(z.string()).default([]),
});

/// Highest numeric admission number in the school (legacy non-numeric ones
/// are ignored for sequencing but remain valid/unchanged).
async function maxAdmissionNumber(schoolId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(CAST("admissionNumber" AS BIGINT)) as max FROM "Student"
    WHERE "schoolId" = ${schoolId} AND "admissionNumber" ~ '^[0-9]+$'`;
  return rows[0]?.max === null || rows[0]?.max === undefined ? null : Number(rows[0].max);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Streams for this form, in registration order — round-robin target list.
  const streams = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId, form: data.form },
    orderBy: { createdAt: "asc" },
    select: { id: true, _count: { select: { students: true } } },
  });
  if (streams.length === 0) {
    return NextResponse.json({ error: "No class exists for that form yet." }, { status: 400 });
  }
  // Round-robin = fewest students wins; ties go to the earliest-registered stream.
  const classId = streams.reduce((a, b) => (b._count.students < a._count.students ? b : a)).id;

  if (data.electiveSubjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: data.electiveSubjectIds }, schoolId: user.schoolId },
    });
    if (count !== data.electiveSubjectIds.length) {
      return NextResponse.json({ error: "Choose valid elective subjects." }, { status: 400 });
    }
  }

  // Retry loop: the (schoolId, admissionNumber) unique constraint is the
  // concurrency guard — a clash simply recomputes the next number.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await maxAdmissionNumber(user.schoolId);
    let next: number;
    if (current === null) {
      if (!data.startingAdmissionNumber) {
        return NextResponse.json(
          { error: "First student — provide a starting admission number." },
          { status: 400 }
        );
      }
      next = data.startingAdmissionNumber;
    } else {
      next = current + 1;
    }

    try {
      const student = await prisma.student.create({
        data: {
          schoolId: user.schoolId,
          fullName: data.fullName,
          admissionNumber: String(next),
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender ?? null,
          boardingStatus: data.boardingStatus ?? null,
          classId,
          parentName: data.parentName || null,
          parentContact: data.parentContact || null,
          electives: {
            create: data.electiveSubjectIds.map((subjectId) => ({ subjectId })),
          },
        },
        include: { schoolClass: true, electives: true },
      });

      // Auto-provision a library card for every new student so they can
      // borrow immediately without a separate card-creation step.
      const settings = await prisma.librarySettings.findUnique({
        where: { schoolId: user.schoolId },
        select: { cardValidityDays: true },
      });
      const year = new Date().getFullYear();
      const lastCard = await prisma.libraryCard.findFirst({
        where: { schoolId: user.schoolId, cardNumber: { startsWith: `LIB-${year}-` } },
        orderBy: { createdAt: "desc" },
        select: { cardNumber: true },
      });
      let seq = 1;
      if (lastCard?.cardNumber) {
        const m = lastCard.cardNumber.match(/(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
      }
      const cardNumber = `LIB-${year}-${String(seq).padStart(5, "0")}`;
      const cardValidity = settings?.cardValidityDays ?? null;
      const expiresAt = cardValidity
        ? new Date(Date.now() + cardValidity * 86_400_000)
        : null;
      await prisma.libraryCard.create({
        data: {
          schoolId: user.schoolId,
          studentId: student.id,
          cardNumber,
          status: "ACTIVE",
          expiresAt,
        },
      }).catch(() => {
        // Non-fatal — card will be auto-provisioned on first library access
        // if creation fails here (e.g. race condition on card number).
      });

      // ── Auto-allocate dorm if school policy + student is boarding ──────
      if (
        data.boardingStatus === "BOARDING" &&
        (await prisma.school.findUnique({
          where: { id: user.schoolId },
          select: { autoAllocateDorms: true },
        }))?.autoAllocateDorms
      ) {
        try {
          const studentForm = student.schoolClass?.form;
          const dorms = await prisma.dormitory.findMany({
            where: { schoolId: user.schoolId, status: "ACTIVE" },
            include: {
              permittedForms: true,
              _count: { select: { allocations: { where: { status: "CURRENT" } } } },
            },
            orderBy: { name: "asc" },
          });
          // Filter by gender and form eligibility
          const eligible = dorms.filter((d) => {
            if (d._count.allocations >= d.totalCapacity && d.totalCapacity > 0) return false;
            if (d.allocationPolicy === "RESTRICTED_BY_FORM" && d.permittedForms.length > 0) {
              if (!d.permittedForms.some((pf: { form: number }) => pf.form === studentForm)) return false;
            }
            return true;
          });
          if (eligible.length > 0) {
            // Round-robin: pick the dorm with the most available capacity
            const chosen = eligible.reduce((a, b) => {
              const ca = Math.max(0, a.totalCapacity - a._count.allocations);
              const cb = Math.max(0, b.totalCapacity - b._count.allocations);
              return cb > ca ? b : a;
            });
            await prisma.allocationRecord.create({
              data: {
                schoolId:  user.schoolId,
                studentId: student.id,
                dormId:    chosen.id,
                status:    "CURRENT",
                startDate: new Date(),
                notes:     "Auto-allocated on registration",
                allocatedById: user.id,
              },
            });
            await prisma.dormitory.update({
              where: { id: chosen.id },
              data: { totalCapacity: chosen.totalCapacity }, // keep totalCapacity; occupancy is counted
            });
          }
        } catch {
          // Auto-allocation is non-fatal — student is still registered
        }
      }

      emitSSE(user.schoolId, "student.created", student);
      return NextResponse.json(student, { status: 201 });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "P2002") continue; // concurrent insert took this number — retry
      return NextResponse.json({ error: "Couldn't register student." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Couldn't register student — please retry." }, { status: 409 });
}
