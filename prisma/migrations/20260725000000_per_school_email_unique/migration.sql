-- Migration: per-school email uniqueness
-- Drop the old global unique index on User.email
DROP INDEX IF EXISTS "User_email_key";

-- Add per-school composite unique: same email can exist at different schools
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_email_key" UNIQUE ("schoolId", "email");
