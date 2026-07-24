-- AddColumn: Student lifecycle fields
ALTER TABLE "Student" ADD COLUMN "archivedAt"    TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "archiveType"   TEXT;
ALTER TABLE "Student" ADD COLUMN "archiveReason" TEXT;
ALTER TABLE "Student" ADD COLUMN "archivedById"  TEXT;

-- AddColumn: Teacher lifecycle fields
ALTER TABLE "Teacher" ADD COLUMN "archivedAt"           TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN "archiveType"          TEXT;
ALTER TABLE "Teacher" ADD COLUMN "archiveReason"        TEXT;
ALTER TABLE "Teacher" ADD COLUMN "archivedById"         TEXT;
ALTER TABLE "Teacher" ADD COLUMN "employmentStartDate"  TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN "designationSnapshot"  TEXT;
ALTER TABLE "Teacher" ADD COLUMN "departmentSnapshot"   TEXT;

-- CreateTable: RecycledStaffId
CREATE TABLE "RecycledStaffId" (
    "id"        TEXT NOT NULL,
    "schoolId"  TEXT NOT NULL,
    "staffId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecycledStaffId_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecycledStaffId_schoolId_staffId_key" ON "RecycledStaffId"("schoolId", "staffId");
CREATE INDEX "RecycledStaffId_schoolId_staffId_idx" ON "RecycledStaffId"("schoolId", "staffId");

-- AddForeignKey: RecycledStaffId -> School
ALTER TABLE "RecycledStaffId" ADD CONSTRAINT "RecycledStaffId_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AuditLog
CREATE TABLE "AuditLog" (
    "id"            TEXT NOT NULL,
    "schoolId"      TEXT NOT NULL,
    "action"        TEXT NOT NULL,
    "detail"        JSONB NOT NULL,
    "performedById" TEXT,
    "performedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_schoolId_performedAt_idx" ON "AuditLog"("schoolId", "performedAt");
CREATE INDEX "AuditLog_schoolId_action_idx"      ON "AuditLog"("schoolId", "action");

-- AddForeignKey: AuditLog -> School
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AuditLog -> User (nullable)
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Student -> User (archivedBy, nullable)
ALTER TABLE "Student" ADD CONSTRAINT "Student_archivedById_fkey"
    FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Teacher -> User (archivedBy, nullable)
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_archivedById_fkey"
    FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: Student lifecycle queries
CREATE INDEX "Student_schoolId_archivedAt_idx" ON "Student"("schoolId", "archivedAt");

-- CreateIndex: Teacher lifecycle queries
CREATE INDEX "Teacher_schoolId_archivedAt_idx" ON "Teacher"("schoolId", "archivedAt");

-- Add HISTORY to Module enum
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'HISTORY';
