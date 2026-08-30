import { z } from "zod";

export const employeeNumberSchema = z.string().trim().regex(/^1\d{3}$/).refine(
  (value) => Number(value) >= 1001 && Number(value) <= 1999,
  "Employee number must be between 1001 and 1999.",
);

export const employeeIdSessionSchema = z.object({
  employeeNumber: employeeNumberSchema,
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
  employeeNumber: employeeNumberSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export const employeeUpdateSchema = z.object({
  employeeNumber: employeeNumberSchema.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
});
