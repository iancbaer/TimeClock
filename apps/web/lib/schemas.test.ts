import { describe, expect, it } from "vitest";
import { clockCodeSchema, correctionSchema, employeeCreateSchema, employeeNumberSchema, punchSchema } from "./schemas";

describe("kiosk input validation", () => {
  it("accepts only 6 to 10 numeric clock-code digits", () => {
    expect(clockCodeSchema.safeParse({ clockCode: "12ab56" }).success).toBe(false);
    expect(clockCodeSchema.safeParse({ clockCode: "12345" }).success).toBe(false);
    expect(clockCodeSchema.safeParse({ clockCode: "731905" }).success).toBe(true);
  });

  it("reserves official employee numbers from 1001 through 1999", () => {
    expect(employeeNumberSchema.safeParse("1001").success).toBe(true);
    expect(employeeNumberSchema.safeParse("1999").success).toBe(true);
    expect(employeeNumberSchema.safeParse("1000").success).toBe(false);
    expect(employeeCreateSchema.safeParse({ employeeNumber: "1001", firstName: "A", lastName: "B", clockCode: "731905" }).success).toBe(true);
  });

  it("requires a UUID idempotency key for punches", () => {
    expect(
      punchSchema.safeParse({ type: "WORK_IN", idempotencyKey: "repeat" }).success,
    ).toBe(false);
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
