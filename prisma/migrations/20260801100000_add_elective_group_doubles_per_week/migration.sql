-- AlterTable: add doublesPerWeek to ElectiveGroup
-- Default 0 means all lessons are single blocks (no doubles), matching existing behaviour.
ALTER TABLE "ElectiveGroup" ADD COLUMN "doublesPerWeek" INTEGER NOT NULL DEFAULT 0;
