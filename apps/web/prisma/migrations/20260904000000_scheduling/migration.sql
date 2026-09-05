CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
CREATE TABLE "Shift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shift_valid_range" CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "Shift_employeeId_startsAt_endsAt_idx" ON "Shift"("employeeId", "startsAt", "endsAt");
CREATE INDEX "Shift_status_startsAt_idx" ON "Shift"("status", "startsAt");
CREATE TABLE "TimeOffRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TimeOffRequest_valid_range" CHECK ("endDate" >= "startDate")
);
CREATE INDEX "TimeOffRequest_employeeId_startDate_endDate_idx" ON "TimeOffRequest"("employeeId", "startDate", "endDate");
CREATE INDEX "TimeOffRequest_status_submittedAt_idx" ON "TimeOffRequest"("status", "submittedAt");
