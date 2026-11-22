import { describe, expect, it } from "vitest";
import { calculateTimesheet, formatDuration, payPeriodContaining } from "../src/index.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const base = {
  timeZone: "America/Los_Angeles",
  roundingMode: "EMPLOYEE_FAVOR_DAILY_CEILING" as const,
  roundingIntervalMinutes: 15,
};
// 2026-08-24 is a Monday; local midnight is 07:00 UTC during daylight time.
const summer = { ...base, payPeriodStart: "2026-08-24" };

function shift(id: string, start: string, end: string) {
  return [
    { id: `${id}-in`, type: "WORK_IN" as const, occurredAt: start },
    { id: `${id}-out`, type: "WORK_OUT" as const, occurredAt: end },
  ];
}

function dayOf(result: ReturnType<typeof calculateTimesheet>, date: string) {
  const day = result.weeks.flatMap((week) => week.days).find((item) => item.date === date);
  if (!day) throw new Error(`No day ${date} in the period.`);
  return day;
}

describe("daily rounding", () => {
  it("adds no credit when the day already ends on a quarter hour", () => {
    const result = calculateTimesheet(shift("a", "2026-08-24T15:00:00Z", "2026-08-24T23:00:00Z"), summer);
    const day = dayOf(result, "2026-08-24");
    expect(day.actualMilliseconds).toBe(8 * HOUR);
    expect(day.creditMilliseconds).toBe(0);
    expect(day.payableMilliseconds).toBe(8 * HOUR);
  });

  it("gives a day with no work no credit", () => {
    const result = calculateTimesheet([], summer);
    expect(result.payableMilliseconds).toBe(0);
    expect(result.creditMilliseconds).toBe(0);
    expect(result.weeks.flatMap((week) => week.days)).toHaveLength(14);
  });

  it("rounds the day's total once, not each work segment", () => {
    const result = calculateTimesheet(
      [
        ...shift("morning", "2026-08-24T15:00:00Z", "2026-08-24T18:07:00Z"),
        ...shift("afternoon", "2026-08-24T19:00:00Z", "2026-08-24T23:07:00Z"),
      ],
      summer,
    );
    const day = dayOf(result, "2026-08-24");
    expect(day.actualMilliseconds).toBe(7 * HOUR + 14 * MINUTE);
    expect(day.creditMilliseconds).toBe(1 * MINUTE);
    expect(day.payableMilliseconds).toBe(7 * HOUR + 15 * MINUTE);
  });

  it("credits one second of work up to the first interval", () => {
    const result = calculateTimesheet(shift("a", "2026-08-24T15:00:00Z", "2026-08-24T15:00:01Z"), summer);
    expect(dayOf(result, "2026-08-24").payableMilliseconds).toBe(15 * MINUTE);
  });
});

describe("shifts that cross a boundary", () => {
  it("splits an overnight shift at local midnight and rounds each day separately", () => {
    // 22:00 Monday to 06:10 Tuesday, Pacific daylight time.
    const result = calculateTimesheet(shift("a", "2026-08-25T05:00:00Z", "2026-08-25T13:10:00Z"), summer);
    const monday = dayOf(result, "2026-08-24");
    const tuesday = dayOf(result, "2026-08-25");
    expect(monday.actualMilliseconds).toBe(2 * HOUR);
    expect(monday.creditMilliseconds).toBe(0);
    expect(tuesday.actualMilliseconds).toBe(6 * HOUR + 10 * MINUTE);
    expect(tuesday.payableMilliseconds).toBe(6 * HOUR + 15 * MINUTE);
    expect(result.actualMilliseconds).toBe(8 * HOUR + 10 * MINUTE);
  });

  it("splits a shift across the two workweeks", () => {
    // 22:00 Sunday 08-30 (last day of week 1) to 02:00 Monday 08-31.
    const result = calculateTimesheet(shift("a", "2026-08-31T05:00:00Z", "2026-08-31T09:00:00Z"), summer);
    expect(result.weeks[0].actualMilliseconds).toBe(2 * HOUR);
    expect(result.weeks[1].actualMilliseconds).toBe(2 * HOUR);
  });

  it("counts only the part of a shift that falls after the period starts", () => {
    // 22:00 Sunday 08-23 (previous period) to 02:00 Monday 08-24.
    const result = calculateTimesheet(shift("a", "2026-08-24T05:00:00Z", "2026-08-24T09:00:00Z"), summer);
    expect(dayOf(result, "2026-08-24").actualMilliseconds).toBe(2 * HOUR);
    expect(result.actualMilliseconds).toBe(2 * HOUR);
  });

  it("counts only the part of a shift that falls before the period ends", () => {
    // 22:00 Sunday 09-06 (last day) to 02:00 Monday 09-07 (next period).
    const result = calculateTimesheet(shift("a", "2026-09-07T05:00:00Z", "2026-09-07T09:00:00Z"), summer);
    expect(dayOf(result, "2026-09-06").actualMilliseconds).toBe(2 * HOUR);
    expect(result.actualMilliseconds).toBe(2 * HOUR);
    expect(result.periodEnd).toBe("2026-09-06");
  });
});

describe("daylight saving changes", () => {
  it("counts the repeated hour when clocks fall back", () => {
    // 22:00 PDT Saturday 10-31 to 06:00 PST Sunday 11-01: nine elapsed hours.
    const result = calculateTimesheet(shift("a", "2026-11-01T05:00:00Z", "2026-11-01T14:00:00Z"), {
      ...base,
      payPeriodStart: "2026-10-26",
    });
    expect(dayOf(result, "2026-10-31").actualMilliseconds).toBe(2 * HOUR);
    expect(dayOf(result, "2026-11-01").actualMilliseconds).toBe(7 * HOUR);
    expect(result.actualMilliseconds).toBe(9 * HOUR);
  });

  it("does not count the skipped hour when clocks spring forward", () => {
    // 22:00 PST Saturday 03-07 to 06:00 PDT Sunday 03-08: seven elapsed hours.
    const result = calculateTimesheet(shift("a", "2026-03-08T06:00:00Z", "2026-03-08T13:00:00Z"), {
      ...base,
      payPeriodStart: "2026-03-02",
    });
    expect(dayOf(result, "2026-03-07").actualMilliseconds).toBe(2 * HOUR);
    expect(dayOf(result, "2026-03-08").actualMilliseconds).toBe(5 * HOUR);
    expect(result.actualMilliseconds).toBe(7 * HOUR);
  });

  it("keeps fourteen calendar days in a period that contains a clock change", () => {
    const result = calculateTimesheet([], { ...base, payPeriodStart: "2026-10-26" });
    const days = result.weeks.flatMap((week) => week.days).map((day) => day.date);
    expect(days).toHaveLength(14);
    expect(new Set(days).size).toBe(14);
    expect(days[0]).toBe("2026-10-26");
    expect(days[13]).toBe("2026-11-08");
  });

  it("finds the right period on either side of a clock change", () => {
    expect(payPeriodContaining("2026-08-24", "2026-11-01", "America/Los_Angeles")).toBe("2026-10-19");
    expect(payPeriodContaining("2026-08-24", "2026-11-02", "America/Los_Angeles")).toBe("2026-11-02");
    expect(payPeriodContaining("2026-03-02", "2026-03-15", "America/Los_Angeles")).toBe("2026-03-02");
    expect(payPeriodContaining("2026-03-02", "2026-03-16", "America/Los_Angeles")).toBe("2026-03-16");
  });
});

describe("incomplete or contradictory records", () => {
  it("flags an open shift and does not guess its length", () => {
    const result = calculateTimesheet(
      [{ id: "in", type: "WORK_IN", occurredAt: "2026-08-24T15:00:00Z" }],
      { ...summer, asOf: "2026-08-25T03:00:00Z" },
    );
    expect(result.actualMilliseconds).toBe(0);
    expect(result.payableMilliseconds).toBe(0);
    expect(result.issues.map((item) => item.code)).toEqual(["OPEN_WORK_SEGMENT"]);
  });

  it("flags a repeated clock-in and counts the shift from the first one", () => {
    const result = calculateTimesheet(
      [
        { id: "in-1", type: "WORK_IN", occurredAt: "2026-08-24T15:00:00Z" },
        { id: "in-2", type: "WORK_IN", occurredAt: "2026-08-24T16:00:00Z" },
        { id: "out", type: "WORK_OUT", occurredAt: "2026-08-24T19:00:00Z" },
      ],
      summer,
    );
    expect(result.actualMilliseconds).toBe(4 * HOUR);
    expect(result.issues).toEqual([expect.objectContaining({ code: "UNEXPECTED_PUNCH", punchId: "in-2" })]);
  });

  it("flags a clock-out with no clock-in and counts nothing for it", () => {
    const result = calculateTimesheet(
      [{ id: "out", type: "WORK_OUT", occurredAt: "2026-08-24T23:00:00Z" }],
      summer,
    );
    expect(result.actualMilliseconds).toBe(0);
    expect(result.issues).toEqual([expect.objectContaining({ code: "UNEXPECTED_PUNCH", punchId: "out" })]);
  });

  it("flags more than five continuous hours, but not a day split by clocking out for a meal", () => {
    const continuous = calculateTimesheet(shift("a", "2026-08-24T15:00:00Z", "2026-08-24T23:00:00Z"), summer);
    expect(continuous.issues.map((item) => item.code)).toEqual(["MISSING_MEAL"]);
    const split = calculateTimesheet(
      [
        ...shift("morning", "2026-08-24T15:00:00Z", "2026-08-24T19:00:00Z"),
        ...shift("afternoon", "2026-08-24T19:30:00Z", "2026-08-24T23:30:00Z"),
      ],
      summer,
    );
    expect(split.issues).toEqual([]);
    expect(split.actualMilliseconds).toBe(8 * HOUR);
  });

  it("gives the same answer whatever order the punches arrive in", () => {
    const punches = [
      ...shift("a", "2026-08-24T15:00:00Z", "2026-08-24T23:07:00Z"),
      ...shift("b", "2026-08-25T15:00:00Z", "2026-08-25T22:00:00Z"),
    ];
    expect(calculateTimesheet([...punches].reverse(), summer)).toEqual(calculateTimesheet(punches, summer));
  });
});

describe("overtime", () => {
  it("is zero at exactly forty payable hours", () => {
    const punches = ["24", "25", "26", "27", "28"].flatMap((day) =>
      shift(day, `2026-08-${day}T15:00:00Z`, `2026-08-${day}T23:00:00Z`));
    const week = calculateTimesheet(punches, summer).weeks[0];
    expect(week.payableMilliseconds).toBe(40 * HOUR);
    expect(week.regularMilliseconds).toBe(40 * HOUR);
    expect(week.overtimeMilliseconds).toBe(0);
  });

  it("does not carry hours from one week into the other", () => {
    const punches = [
      ...["24", "25", "26", "27", "28", "29"].flatMap((day) =>
        shift(day, `2026-08-${day}T15:00:00Z`, `2026-08-${day}T23:00:00Z`)),
      ...shift("w2", "2026-08-31T15:00:00Z", "2026-08-31T23:00:00Z"),
    ];
    const result = calculateTimesheet(punches, summer);
    expect(result.weeks[0].overtimeMilliseconds).toBe(8 * HOUR);
    expect(result.weeks[1].overtimeMilliseconds).toBe(0);
    expect(result.regularMilliseconds).toBe(48 * HOUR);
    expect(result.overtimeMilliseconds).toBe(8 * HOUR);
  });
});

describe("settings and formatting", () => {
  it("rejects period lengths the calculation does not support", () => {
    expect(() => calculateTimesheet([], { ...summer, payPeriodDays: 7 })).toThrow(/14-day/);
    expect(() => calculateTimesheet([], { ...summer, payPeriodStart: "not-a-date" })).toThrow(/Invalid/);
  });

  it("formats durations as hours and minutes", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7 * HOUR + 45 * MINUTE)).toBe("7:45");
    expect(formatDuration(41 * HOUR + 5 * MINUTE)).toBe("41:05");
  });
});
