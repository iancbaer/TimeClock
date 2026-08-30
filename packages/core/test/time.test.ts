import { describe, expect, it } from "vitest";
import { allowedPunchTypes, calculateTimesheet, payPeriodContaining } from "../src/index.js";

const settings = {
  timeZone: "America/Los_Angeles",
  roundingMode: "EMPLOYEE_FAVOR_DAILY_CEILING" as const,
  roundingIntervalMinutes: 15,
  payPeriodStart: "2026-08-24",
};

describe("employee-favorable pay credit", () => {
  it("retains actual time and credits each daily total up to 15 minutes", () => {
    const result = calculateTimesheet(
      [
        { id: "1", type: "WORK_IN", occurredAt: "2026-08-24T15:02:00.000Z" },
        { id: "2", type: "MEAL_START", occurredAt: "2026-08-24T19:00:00.000Z" },
        { id: "3", type: "MEAL_END", occurredAt: "2026-08-24T19:30:00.000Z" },
        { id: "4", type: "WORK_OUT", occurredAt: "2026-08-24T23:09:00.000Z" },
      ],
      settings,
    );
    const day = result.weeks[0].days[0]!;
    expect(day.actualMilliseconds).toBe(7 * 60 * 60 * 1000 + 37 * 60 * 1000);
    expect(day.payableMilliseconds).toBe(7 * 60 * 60 * 1000 + 45 * 60 * 1000);
    expect(day.creditMilliseconds).toBe(8 * 60 * 1000);
    expect(day.mealMilliseconds).toBe(30 * 60 * 1000);
  });

  it("never rounds meal duration and flags a short meal", () => {
    const result = calculateTimesheet(
      [
        { id: "1", type: "WORK_IN", occurredAt: "2026-08-24T15:00:00.000Z" },
        { id: "2", type: "MEAL_START", occurredAt: "2026-08-24T19:00:00.000Z" },
        { id: "3", type: "MEAL_END", occurredAt: "2026-08-24T19:29:00.000Z" },
        { id: "4", type: "WORK_OUT", occurredAt: "2026-08-24T23:00:00.000Z" },
      ],
      settings,
    );
    expect(result.weeks[0].days[0]!.mealMilliseconds).toBe(29 * 60 * 1000);
    expect(result.issues.map((item) => item.code)).toContain("SHORT_MEAL");
  });

  it("calculates overtime independently for each week using payable hours", () => {
    const punches = Array.from({ length: 10 }, (_, index) => {
      const day = 24 + index + (index >= 5 ? 2 : 0);
      const isoDay = `2026-${day <= 31 ? "08" : "09"}-${String(day <= 31 ? day : day - 31).padStart(2, "0")}`;
      return [
        { id: `${index}-in`, type: "WORK_IN" as const, occurredAt: `${isoDay}T15:00:00.000Z` },
        { id: `${index}-out`, type: "WORK_OUT" as const, occurredAt: `${isoDay}T23:06:00.000Z` },
      ];
    }).flat();
    const result = calculateTimesheet(punches, settings);
    expect(result.weeks[0].payableMilliseconds).toBe(41.25 * 60 * 60 * 1000);
    expect(result.weeks[0].overtimeMilliseconds).toBe(1.25 * 60 * 60 * 1000);
    expect(result.weeks[1].overtimeMilliseconds).toBe(1.25 * 60 * 60 * 1000);
  });
});

describe("clock state", () => {
  it("permits clock out or meal start while working", () => {
    expect(allowedPunchTypes([{ type: "WORK_IN", occurredAt: "2026-08-24T15:00:00Z" }])).toEqual([
      "MEAL_START",
      "WORK_OUT",
    ]);
  });
});

describe("pay periods", () => {
  it("finds periods before and after the anchor", () => {
    expect(payPeriodContaining("2026-08-24", "2026-09-01", "America/Los_Angeles")).toBe("2026-08-24");
    expect(payPeriodContaining("2026-08-24", "2026-09-07", "America/Los_Angeles")).toBe("2026-09-07");
    expect(payPeriodContaining("2026-08-24", "2026-08-23", "America/Los_Angeles")).toBe("2026-08-10");
  });
});
