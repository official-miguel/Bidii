-- Migration: RBAC v2 — granular permissions, multi-role support, permission audit log
-- 1. Add granular action columns to RolePermission
-- 2. Create UserStaffRole join table (multi-role per user)
-- 3. Create PermissionAuditLog table

-- ─── 1. Extend RolePermission with granular action flags ─────────────────────
ALTER TABLE "RolePermission"
  ADD COLUMN IF NOT EXISTS "canCreate"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canEdit"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canDelete"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canApprove"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canExport"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canPrint"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canConfigure" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canAIAccess"  BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: if canManage was true, enable all write actions for smooth upgrade
UPDATE "RolePermission"
SET
  "canCreate"    = true,
  "canEdit"      = true,
  "canDelete"    = true,
  "canApprove"   = true,
  "canExport"    = true,
  "canPrint"     = true,
  "canConfigure" = false  -- configure stays opt-in; don't auto-grant
WHERE "canManage" = true;

-- ─── 2. UserStaffRole join table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserStaffRole" (
  "userId"       TEXT NOT NULL,
  "staffRoleId"  TEXT NOT NULL,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById" TEXT,

  CONSTRAINT "UserStaffRole_pkey" PRIMARY KEY ("userId", "staffRoleId"),
  CONSTRAINT "UserStaffRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserStaffRole_staffRoleId_fkey"
    FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserStaffRole_userId_idx"      ON "UserStaffRole"("userId");
CREATE INDEX IF NOT EXISTS "UserStaffRole_staffRoleId_idx" ON "UserStaffRole"("staffRoleId");

-- Back-fill: seed UserStaffRole rows from existing User.staffRoleId links so
-- the new multi-role table is immediately consistent with the legacy column.
INSERT INTO "UserStaffRole" ("userId", "staffRoleId", "assignedAt")
SELECT u."id", u."staffRoleId", u."createdAt"
FROM "User" u
WHERE u."staffRoleId" IS NOT NULL
  AND u."role" = 'ADMIN_STAFF'
ON CONFLICT DO NOTHING;

-- ─── 3. PermissionAuditLog table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PermissionAuditLog" (
  "id"            TEXT NOT NULL,
  "schoolId"      TEXT NOT NULL,
  "performedById" TEXT NOT NULL,
  "targetUserId"  TEXT,
  "staffRoleId"   TEXT,
  "module"        TEXT,
  "action"        TEXT NOT NULL,
  "changes"       JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionAuditLog_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PermissionAuditLog_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PermissionAuditLog_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PermissionAuditLog_schoolId_idx"        ON "PermissionAuditLog"("schoolId");
CREATE INDEX IF NOT EXISTS "PermissionAuditLog_performedById_idx"   ON "PermissionAuditLog"("performedById");
CREATE INDEX IF NOT EXISTS "PermissionAuditLog_targetUserId_idx"    ON "PermissionAuditLog"("targetUserId");
CREATE INDEX IF NOT EXISTS "PermissionAuditLog_staffRoleId_idx"     ON "PermissionAuditLog"("staffRoleId");
CREATE INDEX IF NOT EXISTS "PermissionAuditLog_schoolId_createdAt_idx" ON "PermissionAuditLog"("schoolId", "createdAt");
