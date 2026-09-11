CREATE TABLE "ShiftSeries" ("id" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 1, "intervalWeeks" INTEGER NOT NULL, "weekdays" INTEGER[] NOT NULL, "untilDate" DATE NOT NULL, "timeZone" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE "Shift" ADD COLUMN "seriesId" TEXT REFERENCES "ShiftSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Shift_seriesId_startsAt_idx" ON "Shift"("seriesId", "startsAt");
CREATE TYPE "AttendanceKind" AS ENUM ('SICK', 'NO_CALL_NO_SHOW');
CREATE TABLE "AttendanceRecord" ("id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "date" DATE NOT NULL, "kind" "AttendanceKind" NOT NULL, "note" TEXT NOT NULL DEFAULT '', "voided" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1, "recordedById" TEXT NOT NULL REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AttendanceRecord_employeeId_date_idx" ON "AttendanceRecord"("employeeId", "date");
CREATE UNIQUE INDEX "AttendanceRecord_active_employee_date" ON "AttendanceRecord"("employeeId", "date") WHERE NOT "voided";
