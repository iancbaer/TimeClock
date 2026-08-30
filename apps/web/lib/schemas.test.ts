import { describe, expect, it } from "vitest";
import { correctionSchema, employeeCreateSchema, employeeIdSessionSchema, employeeNumberSchema, punchSchema } from "./schemas";

describe("kiosk input validation", () => {
  it("accepts only an official 1xxx employee ID", () => {
    expect(employeeIdSessionSchema.safeParse({ employeeNumber: "1001" }).success).toBe(true);
    expect(employeeIdSessionSchema.safeParse({ employeeNumber: "1000" }).success).toBe(false);
    expect(employeeIdSessionSchema.safeParse({ employeeNumber: "abcd" }).success).toBe(false);
  });

  it("reserves official employee numbers from 1001 through 1999", () => {
    expect(employeeNumberSchema.safeParse("1001").success).toBe(true);
    expect(employeeNumberSchema.safeParse("1999").success).toBe(true);
    expect(employeeNumberSchema.safeParse("1000").success).toBe(false);
    expect(employeeCreateSchema.safeParse({ employeeNumber: "1001", firstName: "A", lastName: "B" }).success).toBe(true);
  });

  it("requires a UUID idempotency key for punches", () => {
    expect(
      punchSchema.safeParse({ type: "WORK_IN", idempotencyKey: "repeat" }).success,
    ).toBe(false);
  });

  it("rejects meal actions from the simplified worker punch API", () => {
    expect(punchSchema.safeParse({ type: "MEAL_START", idempotencyKey: crypto.randomUUID() }).success).toBe(false);
  });

  it("accepts an employee correction request without changing a punch", () => {
    expect(
      correctionSchema.safeParse({
        kind: "MISSED_PUNCH",
        requestedType: "WORK_OUT",
        requestedOccurredAt: "2026-08-28T23:00:00.000Z",
        note: "I forgot to clock out at the end of my shift.",
      }).success,
    ).toBe(true);
  });
});
