import { describe, expect, it } from "vitest";
import { calendarDate, overlaps, shiftBounds, timeOffBounds, timeOffInput } from "./scheduling-rules";

const zone = "America/Los_Angeles";
describe("scheduling dates and conflicts", () => {
  it("accepts one-day leave and defaults the optional note", () => {
    expect(timeOffInput.parse({ startDate: "2026-09-10", endDate: "2026-09-10" }).note).toBe("");
    expect(timeOffInput.safeParse({ startDate: "2026-09-11", endDate: "2026-09-10" }).success).toBe(false);
    expect(calendarDate.safeParse("2026-02-30").success).toBe(false);
  });
  it("includes the last day in the company timezone", () => {
    const leave = timeOffBounds("2026-09-10", "2026-09-11", zone);
    expect(leave.startsAt.toISOString()).toBe("2026-09-10T07:00:00.000Z");
    expect(leave.endsAt.toISOString()).toBe("2026-09-12T07:00:00.000Z");
    expect(overlaps(leave, shiftBounds("2026-09-09T22:00", "2026-09-10T02:00", zone))).toBe(true);
    expect(overlaps(leave, shiftBounds("2026-09-11T23:00", "2026-09-12T02:00", zone))).toBe(true);
    expect(overlaps(leave, shiftBounds("2026-09-12T00:00", "2026-09-12T08:00", zone))).toBe(false);
    expect(overlaps(leave, shiftBounds("2026-09-09T16:00", "2026-09-10T00:00", zone))).toBe(false);
  });
  it("uses calendar days across daylight-saving changes", () => {
    const spring = timeOffBounds("2026-03-08", "2026-03-08", zone);
    const fall = timeOffBounds("2026-11-01", "2026-11-01", zone);
    expect((+spring.endsAt - +spring.startsAt) / 3600000).toBe(23);
    expect((+fall.endsAt - +fall.startsAt) / 3600000).toBe(25);
  });
  it("rejects impossible, ambiguous, reversed and zero-length shifts", () => {
    expect(() => shiftBounds("2026-03-08T02:30", "2026-03-08T04:00", zone)).toThrow();
    expect(() => shiftBounds("2026-11-01T01:30", "2026-11-01T04:00", zone)).toThrow();
    expect(() => shiftBounds("2026-09-10T09:00", "2026-09-10T09:00", zone)).toThrow();
    expect(() => shiftBounds("2026-09-10T09:00", "2026-09-10T08:00", zone)).toThrow();
  });
});
