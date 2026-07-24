-- Add optional opening and closing dates to CalendarEvent for term date tracking.
ALTER TABLE "CalendarEvent" ADD COLUMN "openingDate" TIMESTAMP,
ADD COLUMN "closingDate" TIMESTAMP;
