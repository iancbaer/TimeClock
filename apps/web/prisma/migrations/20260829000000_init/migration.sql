-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('WORK_IN', 'MEAL_START', 'MEAL_END', 'WORK_OUT');
CREATE TYPE "PunchSource" AS ENUM ('KIOSK', 'ADMIN_CORRECTION');
CREATE TYPE "CorrectionKind" AS ENUM ('MISSED_PUNCH', 'WRONG_TIME', 'OTHER');
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "RoundingMode" AS ENUM ('EXACT', 'EMPLOYEE_FAVOR_DAILY_CEILING');

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'My Company',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "payPeriodAnchor" DATE NOT NULL,
    "workweekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "roundingMode" "RoundingMode" NOT NULL DEFAULT 'EMPLOYEE_FAVOR_DAILY_CEILING',
    "roundingIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Punch" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PunchType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "PunchSource" NOT NULL DEFAULT 'KIOSK',
    "deviceLabel" TEXT,
    "idempotencyKey" TEXT,
    "correctionRequestId" TEXT,
    CONSTRAINT "Punch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PunchRevision" (
    "id" TEXT NOT NULL,
    "punchId" TEXT NOT NULL,
    "effectiveOccurredAt" TIMESTAMP(3),
    "effectiveType" "PunchType",
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "correctionRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PunchRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "targetPunchId" TEXT,
    "kind" "CorrectionKind" NOT NULL,
    "requestedType" "PunchType",
    "requestedOccurredAt" TIMESTAMP(3),
    "note" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");
CREATE INDEX "Employee_active_lastName_firstName_idx" ON "Employee"("active", "lastName", "firstName");
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "Punch_idempotencyKey_key" ON "Punch"("idempotencyKey");
CREATE UNIQUE INDEX "Punch_correctionRequestId_key" ON "Punch"("correctionRequestId");
CREATE INDEX "Punch_employeeId_occurredAt_idx" ON "Punch"("employeeId", "occurredAt");
CREATE INDEX "Punch_recordedAt_idx" ON "Punch"("recordedAt");
CREATE UNIQUE INDEX "PunchRevision_correctionRequestId_key" ON "PunchRevision"("correctionRequestId");
CREATE INDEX "PunchRevision_punchId_createdAt_idx" ON "PunchRevision"("punchId", "createdAt");
CREATE INDEX "CorrectionRequest_status_submittedAt_idx" ON "CorrectionRequest"("status", "submittedAt");
CREATE INDEX "CorrectionRequest_employeeId_submittedAt_idx" ON "CorrectionRequest"("employeeId", "submittedAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PunchRevision" ADD CONSTRAINT "PunchRevision_punchId_fkey" FOREIGN KEY ("punchId") REFERENCES "Punch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PunchRevision" ADD CONSTRAINT "PunchRevision_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PunchRevision" ADD CONSTRAINT "PunchRevision_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_targetPunchId_fkey" FOREIGN KEY ("targetPunchId") REFERENCES "Punch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
