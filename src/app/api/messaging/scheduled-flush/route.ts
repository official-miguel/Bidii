/**
 * GET /api/messaging/scheduled-flush
 *
 * Cron-triggered route that dispatches all scheduled messages whose
 * scheduledAt <= now(). Add to vercel.json:
 *   { "crons": [{ "path": "/api/messaging/scheduled-flush", "schedule": "* * * * *" }] }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRecipients, buildRecipientSummary } from "@/lib/messaging/resolve";
import { dispatchMessage } from "@/lib/messaging/dispatch";

// Never statically pre-rendered — always runs at request time
export const dynamic = "force-dynamic";

export async function GET() {
  const due = await prisma.message.findMany({
    where: {
      status:      "PENDING",
      scheduledAt: { lte: new Date() },
    },
  });

  let dispatched = 0;

  for (const message of due) {
    try {
      const { resolved, skipped } = await resolveRecipients(
        message.recipientDescriptor as never,
        message.schoolId
      );

      const summary = buildRecipientSummary(message.recipientDescriptor as never, resolved.length);
      await prisma.message.update({
        where: { id: message.id },
        data:  { recipientSummary: summary },
      });

      const settings = await prisma.messagingSettings.findUnique({
        where: { schoolId: message.schoolId },
      });
      const batchSize = settings?.batchSize ?? 50;

      for (let i = 0; i < resolved.length; i += batchSize) {
        const batch = resolved.slice(i, i + batchSize);
        await Promise.all(batch.map(async ({ label, phone }) => {
          const result = await dispatchMessage(message.schoolId, message.channel, phone, message.body);
          await prisma.messageLog.create({
            data: {
              messageId:      message.id,
              schoolId:       message.schoolId,
              channel:        message.channel,
              phone,
              recipientLabel: label,
              status:         result.status,
              providerMsgId:  result.providerMsgId ?? null,
              errorDetail:    result.errorDetail   ?? null,
            },
          });
        }));
      }

      for (const { label, reason } of skipped) {
        await prisma.messageLog.create({
          data: {
            messageId:      message.id,
            schoolId:       message.schoolId,
            channel:        message.channel,
            phone:          "N/A",
            recipientLabel: label,
            status:         "FAILED",
            errorDetail:    reason,
          },
        });
      }

      const failedCount = await prisma.messageLog.count({ where: { messageId: message.id, status: "FAILED" } });
      const totalCount  = await prisma.messageLog.count({ where: { messageId: message.id } });
      await prisma.message.update({
        where: { id: message.id },
        data:  { status: failedCount === totalCount ? "FAILED" : "SENT" },
      });

      dispatched++;
    } catch {
      await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED" } }).catch(() => {});
    }
  }

  return NextResponse.json({ dispatched });
}
