-- Add optional opening and closing dates to ExamPeriod for term date tracking.
ALTER TABLE "ExamPeriod" ADD COLUMN "openingDate" TIMESTAMP,
ADD COLUMN "closingDate" TIMESTAMP;
