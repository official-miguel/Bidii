/**
 * DEPRECATED — use DELETE /api/timetable/session-preferences
 * Returns 410 Gone to direct clients to the replacement endpoint.
 */
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      migration:
        `Use PUT /api/timetable/session-preferences with the updated preferences array ` +
        `to remove a preference (omit the entry with id ${params.id}).`,
    },
    { status: 410 }
  );
}
