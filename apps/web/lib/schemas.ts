import { z } from "zod";

export const employeeNumberSchema = z.string().trim().regex(/^1\d{3}$/).refine(
  (value) => Number(value) >= 1001 && Number(value) <= 1999,
  "Employee number must be between 1001 and 1999.",
);

export const employeePinSchema = z.string().trim().regex(/^\d{4}$/, "PIN must contain exactly four digits.");

export const employeeIdSessionSchema = z.object({
  pin: employeePinSchema,
});

export const punchSchema = z.object({
  type: z.enum(["WORK_IN", "WORK_OUT"]),
  idempotencyKey: z.string().uuid(),
  deviceLabel: z.string().trim().max(80).optional(),
});

export const correctionSchema = z.object({
  kind: z.enum(["MISSED_PUNCH", "WRONG_TIME", "OTHER"]),
  targetPunchId: z.string().cuid().optional().nullable(),
  requestedType: z.enum(["WORK_IN", "WORK_OUT"]).optional().nullable(),
  requestedOccurredAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().min(5).max(1000),
});

export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  manager: z.boolean().optional().default(false),
  pin: employeePinSchema.optional(),
});

export const offlinePunchSchema = punchSchema.extend({
  occurredAt: z.string().datetime(),
});

export const employeeUpdateSchema = z.object({
  employeeNumber: employeeNumberSchema.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  manager: z.boolean().optional(),
  pin: employeePinSchema.optional(),
});
