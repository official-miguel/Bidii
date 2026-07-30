/**
 * API Route: /api/timetable/constraints
 * 
 * DEPRECATED — replaced by:
 *   POST /api/timetable/translate-preference  (convert instruction → structured rule)
 *   PUT  /api/timetable/session-preferences   (save structured session preferences)
 * 
 * This stub redirects callers so any existing client code that hasn't been
 * updated yet gets a clear 410 Gone with migration instructions.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      migration:
        "Use GET /api/timetable/session-preferences to retrieve scheduling preferences.",
    },
    { status: 410 }
  );
}

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      migration:
        "Use POST /api/timetable/translate-preference to parse a natural language instruction, " +
        "then PUT /api/timetable/session-preferences to save the resulting structured preference.",
    },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      migration:
        "Use PUT /api/timetable/session-preferences with an empty preferences array to clear all preferences.",
    },
    { status: 410 }
  );
}
