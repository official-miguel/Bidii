import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requirePermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const message = await prisma.message.findUnique({ where: { id: params.id } });

  if (!message || message.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (message.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING messages can be cancelled." }, { status: 400 });
  }
  if (!message.scheduledAt || message.scheduledAt <= new Date()) {
    return NextResponse.json({ error: "Message has already been dispatched." }, { status: 400 });
  }

  await prisma.message.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ ok: true });
}
