CREATE TYPE "PayPeriodApprovalStatus" AS ENUM ('APPROVED', 'REOPENED');

ALTER TABLE "CompanySettings"
  ADD COLUMN "approvalDelayDays" INTEGER,
  ADD COLUMN "approvalOpenLocalTime" TEXT;

ALTER TABLE "AdminUser"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PayPeriodApproval" (
  "id" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PayPeriodApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedById" TEXT NOT NULL,
  "blockerJustification" TEXT,
  "blockersSnapshot" JSONB NOT NULL,
  "settingsSnapshot" JSONB NOT NULL,
  "reportSnapshot" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "staleAt" TIMESTAMP(3),
  "staleReason" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayPeriodApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayPeriodApproval_periodStart_version_key"
  ON "PayPeriodApproval"("periodStart", "version");
CREATE INDEX "PayPeriodApproval_periodStart_status_idx"
  ON "PayPeriodApproval"("periodStart", "status");
CREATE INDEX "PayPeriodApproval_approvedAt_idx"
  ON "PayPeriodApproval"("approvedAt");

ALTER TABLE "PayPeriodApproval"
  ADD CONSTRAINT "PayPeriodApproval_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayPeriodApproval"
  ADD CONSTRAINT "PayPeriodApproval_reopenedById_fkey"
  FOREIGN KEY ("reopenedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanySettings"
  ADD CONSTRAINT "CompanySettings_approval_schedule_pair_check"
  CHECK (("approvalDelayDays" IS NULL AND "approvalOpenLocalTime" IS NULL)
      OR ("approvalDelayDays" BETWEEN 1 AND 14 AND "approvalOpenLocalTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));
