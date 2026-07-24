-- Add openingDate and closingDate to AssessmentPeriod
-- openingDate: when marks entry opens (informational)
-- closingDate: marks submission deadline, shown as countdown in teacher dashboards

ALTER TABLE "AssessmentPeriod" ADD COLUMN "openingDate" TIMESTAMP(3);
ALTER TABLE "AssessmentPeriod" ADD COLUMN "closingDate" TIMESTAMP(3);
