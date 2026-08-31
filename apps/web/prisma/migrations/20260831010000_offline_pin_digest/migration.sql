ALTER TABLE "Employee" ADD COLUMN "offlinePinDigest" TEXT;

CREATE UNIQUE INDEX "Employee_offlinePinDigest_key" ON "Employee"("offlinePinDigest");
