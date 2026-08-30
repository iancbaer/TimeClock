-- Establish an official, human-facing employee identifier that is distinct
-- from the private clock-code authentication secret.
ALTER TABLE "Employee" ADD COLUMN "employeeNumber" TEXT;

-- Existing employees receive stable numbers in creation order, beginning at
-- 1001. The explicit guard keeps the promised 1xxx namespace honest.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Employee") > 999 THEN
    RAISE EXCEPTION 'The 1xxx employee-number namespace supports at most 999 employees';
  END IF;
END $$;

WITH numbered AS (
  SELECT "id", 1000 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS value
  FROM "Employee"
)
UPDATE "Employee" AS employee
SET "employeeNumber" = numbered.value::TEXT
FROM numbered
WHERE employee."id" = numbered."id";

ALTER TABLE "Employee" ALTER COLUMN "employeeNumber" SET NOT NULL;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_employeeNumber_range"
  CHECK ("employeeNumber" ~ '^1[0-9]{3}$' AND "employeeNumber"::INTEGER BETWEEN 1001 AND 1999);
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
