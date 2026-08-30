import { z } from "zod";

export const clockCodeSchema = z.object({
  clockCode: z.string().regex(/^\d{6,10}$/, "Clock code must contain 6 to 10 digits."),
});

export const punchSchema = z.object({
  type: z.enum(["WORK_IN", "MEAL_START", "MEAL_END", "WORK_OUT"]),
  idempotencyKey: z.string().uuid(),
  deviceLabel: z.string().trim().max(80).optional(),
});

export const correctionSchema = z.object({
  kind: z.enum(["MISSED_PUNCH", "WRONG_TIME", "OTHER"]),
  targetPunchId: z.string().cuid().optional().nullable(),
  requestedType: z.enum(["WORK_IN", "MEAL_START", "MEAL_END", "WORK_OUT"]).optional().nullable(),
  requestedOccurredAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().min(5).max(1000),
});

export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  clockCode: z.string().regex(/^\d{6,10}$/),
});

export const employeeUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  clockCode: z.string().regex(/^\d{6,10}$/).optional(),
  active: z.boolean().optional(),
});
