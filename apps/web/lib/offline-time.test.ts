import { calculateTimesheet } from "@timeclock/core";
import { describe, expect, it } from "vitest";
import { validateOfflineOccurrence } from "./offline-time";

describe("offline punch time preservation", () => {
  it("keeps a 9:00 AM tablet punch when it synchronizes later", () => {
    const tabletOccurrence = "2026-09-01T16:00:00.000Z"; // 9:00 AM America/Los_Angeles
    const databaseReceipt = new Date("2026-09-01T18:30:00.000Z");
    const occurredAt = validateOfflineOccurrence(tabletOccurrence, databaseReceipt);
    expect(occurredAt.toISOString()).toBe(tabletOccurrence);
    expect(databaseReceipt.getTime() - occurredAt.getTime()).toBe(2.5 * 60 * 60 * 1000);

    const report = calculateTimesheet([
      { id: "offline-in", type: "WORK_IN", occurredAt },
      { id: "offline-out", type: "WORK_OUT", occurredAt: "2026-09-01T17:00:00.000Z" },
    ], {
      timeZone: "America/Los_Angeles",
      roundingMode: "EXACT",
      roundingIntervalMinutes: 15,
      payPeriodStart: "2026-08-24",
      asOf: databaseReceipt,
    });
    expect(report.weeks[1].days[1]?.punches[0]?.localTime).toBe("9:00:00 AM");
  });

  it("rejects offline timestamps beyond the synchronization window", () => {
    expect(() => validateOfflineOccurrence(
      "2026-07-01T16:00:00.000Z",
      new Date("2026-09-01T18:30:00.000Z"),
    )).toThrow(/30-day synchronization window/);
  });
});
