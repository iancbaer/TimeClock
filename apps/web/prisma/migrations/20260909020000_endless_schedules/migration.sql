ALTER TABLE "ShiftSeries" ALTER COLUMN "untilDate" DROP NOT NULL;
ALTER TABLE "ShiftSeries" ADD COLUMN "template" JSONB;
ALTER TABLE "Shift" ADD COLUMN "occurrenceDate" DATE;
CREATE UNIQUE INDEX "Shift_seriesId_occurrenceDate_key" ON "Shift"("seriesId", "occurrenceDate");
