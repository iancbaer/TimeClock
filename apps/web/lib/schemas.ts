import { z } from "zod";

export const credentialsSchema = z.object({
  employeeCode: z.string().trim().min(1).max(30),
  pin: z.string().regex(/^\d{4,8}$/, "PIN must contain 4 to 8 digits."),
});

export const punchSchema = credentialsSchema.extend({
  type: z.enum(["WORK_IN", "MEAL_START", "MEAL_END", "WORK_OUT"]),
  idempotencyKey: z.string().uuid(),
  deviceLabel: z.string().trim().max(80).optional(),
});

export const correctionSchema = credentialsSchema.extend({
  kind: z.enum(["MISSED_PUNCH", "WRONG_TIME", "OTHER"]),
  targetPunchId: z.string().cuid().optional().nullable(),
  requestedType: z.enum(["WORK_IN", "MEAL_START", "MEAL_END", "WORK_OUT"]).optional().nullable(),
  requestedOccurredAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().min(5).max(1000),
});

export const employeeCreateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,8}$/),
});

export const employeeUpdateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(30).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  active: z.boolean().optional(),
});
