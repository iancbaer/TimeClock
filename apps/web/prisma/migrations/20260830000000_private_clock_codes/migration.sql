-- Replace public employee-code-plus-PIN kiosk authentication with one private
-- clock code. Existing values are retained only as nullable legacy fields so
-- an administrator can rotate each worker onto a new clock code. They are no
-- longer accepted by the worker API or exposed by Steward.
ALTER TABLE "Employee" ALTER COLUMN "employeeCode" DROP NOT NULL;
ALTER TABLE "Employee" ALTER COLUMN "pinHash" DROP NOT NULL;
ALTER TABLE "Employee" ADD COLUMN "clockCodeLookup" TEXT;
ALTER TABLE "Employee" ADD COLUMN "clockCodeHash" TEXT;

CREATE UNIQUE INDEX "Employee_clockCodeLookup_key" ON "Employee"("clockCodeLookup");
