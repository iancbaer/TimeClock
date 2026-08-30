import { describe, expect, it } from "vitest";
import { correctionSchema, credentialsSchema, punchSchema } from "./schemas";

describe("kiosk input validation", () => {
  it("rejects non-numeric or short PINs", () => {
    expect(credentialsSchema.safeParse({ employeeCode: "1001", pin: "12ab" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ employeeCode: "1001", pin: "123" }).success).toBe(false);
  });

  it("requires a UUID idempotency key for punches", () => {
    expect(
      punchSchema.safeParse({ employeeCode: "1001", pin: "2468", type: "WORK_IN", idempotencyKey: "repeat" }).success,
    ).toBe(false);
  });

  it("accepts an employee correction request without changing a punch", () => {
    expect(
      correctionSchema.safeParse({
        employeeCode: "1001",
        pin: "2468",
        kind: "MISSED_PUNCH",
        requestedType: "WORK_OUT",
        requestedOccurredAt: "2026-08-28T23:00:00.000Z",
        note: "I forgot to clock out at the end of my shift.",
      }).success,
    ).toBe(true);
  });
});
