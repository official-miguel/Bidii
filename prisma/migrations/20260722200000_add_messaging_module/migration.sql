-- Migration: add_messaging_module
-- Adds the Communication Centre tables: RecipientGroup, GroupMember,
-- MessageTemplate, Message, MessageLog, MessageRecipientGroup, MessagingSettings

-- Enums
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- RecipientGroup
CREATE TABLE "RecipientGroup" (
  "id"          TEXT NOT NULL,
  "schoolId"    TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecipientGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecipientGroup_schoolId_name_key" ON "RecipientGroup"("schoolId", "name");
CREATE INDEX "RecipientGroup_schoolId_idx" ON "RecipientGroup"("schoolId");
ALTER TABLE "RecipientGroup" ADD CONSTRAINT "RecipientGroup_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GroupMember
CREATE TABLE "GroupMember" (
  "id"        TEXT NOT NULL,
  "groupId"   TEXT NOT NULL,
  "teacherId" TEXT,
  "studentId" TEXT,
  "extName"   TEXT,
  "extPhone"  TEXT,
  CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GroupMember_groupId_idx"   ON "GroupMember"("groupId");
CREATE INDEX "GroupMember_teacherId_idx" ON "GroupMember"("teacherId");
CREATE INDEX "GroupMember_studentId_idx" ON "GroupMember"("studentId");
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "RecipientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MessageTemplate
CREATE TABLE "MessageTemplate" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "category"  TEXT,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_schoolId_name_key" ON "MessageTemplate"("schoolId", "name");
CREATE INDEX "MessageTemplate_schoolId_idx" ON "MessageTemplate"("schoolId");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message
CREATE TABLE "Message" (
  "id"                  TEXT NOT NULL,
  "schoolId"            TEXT NOT NULL,
  "senderUserId"        TEXT NOT NULL,
  "channel"             "MessageChannel" NOT NULL,
  "body"                TEXT NOT NULL,
  "recipientDescriptor" JSONB NOT NULL,
  "recipientSummary"    TEXT NOT NULL,
  "attachmentUrl"       TEXT,
  "attachmentName"      TEXT,
  "scheduledAt"         TIMESTAMP(3),
  "status"              "MessageStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_schoolId_idx"             ON "Message"("schoolId");
CREATE INDEX "Message_schoolId_createdAt_idx"   ON "Message"("schoolId", "createdAt" DESC);
CREATE INDEX "Message_schoolId_status_idx"      ON "Message"("schoolId", "status");
CREATE INDEX "Message_senderUserId_idx"         ON "Message"("senderUserId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON UPDATE CASCADE;

-- MessageLog
CREATE TABLE "MessageLog" (
  "id"             TEXT NOT NULL,
  "messageId"      TEXT NOT NULL,
  "schoolId"       TEXT NOT NULL,
  "channel"        "MessageChannel" NOT NULL,
  "phone"          TEXT NOT NULL,
  "recipientLabel" TEXT NOT NULL,
  "status"         "MessageStatus" NOT NULL DEFAULT 'PENDING',
  "providerMsgId"  TEXT,
  "errorDetail"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageLog_messageId_idx"       ON "MessageLog"("messageId");
CREATE INDEX "MessageLog_schoolId_idx"        ON "MessageLog"("schoolId");
CREATE INDEX "MessageLog_schoolId_status_idx" ON "MessageLog"("schoolId", "status");
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MessageRecipientGroup
CREATE TABLE "MessageRecipientGroup" (
  "messageId" TEXT NOT NULL,
  "groupId"   TEXT NOT NULL,
  CONSTRAINT "MessageRecipientGroup_pkey" PRIMARY KEY ("messageId", "groupId")
);
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "RecipientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MessagingSettings
CREATE TABLE "MessagingSettings" (
  "schoolId"       TEXT NOT NULL,
  "resultsClosing" TEXT NOT NULL DEFAULT 'Thank you for your continued support.',
  "batchSize"      INTEGER NOT NULL DEFAULT 50,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingSettings_pkey" PRIMARY KEY ("schoolId")
);
ALTER TABLE "MessagingSettings" ADD CONSTRAINT "MessagingSettings_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
