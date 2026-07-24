-- Add ATTENDANCE value to the Module enum.
-- This makes attendance a first-class permission module that can be granted
-- to any staff role, instead of being hardwired to PRINCIPAL only.

ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'ATTENDANCE';
