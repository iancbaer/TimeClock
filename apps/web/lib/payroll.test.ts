import type { CompanySettings } from "@prisma/client";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  approvalOpensAt,
  isCompletedPeriod,
  periodStartForOccurrence,
  snapshotHash,
  type CompanyPayPeriodReport,
} from "./payroll";

describe("payroll approval availability", () => {
  it("uses the company time zone across the fall daylight-saving boundary", () => {
    const opensAt = approvalOpensAt({
      periodEnd: "2026-10-31",
      timeZone: "America/Los_Angeles",
      approvalDelayDays: 1,
      approvalOpenLocalTime: "09:00",
    });
    expect(opensAt?.toISO()).toBe("2026-11-01T09:00:00.000-08:00");
  });

  it("uses the company time zone across the spring daylight-saving boundary", () => {
    const opensAt = approvalOpensAt({
      periodEnd: "2026-03-07",
      timeZone: "America/Los_Angeles",
      approvalDelayDays: 1,
      approvalOpenLocalTime: "09:00",
    });
    expect(opensAt?.toISO()).toBe("2026-03-08T09:00:00.000-07:00");
  });

  it("keeps a database DATE anchor on its stored calendar date", () => {
    const settings = {
      payPeriodAnchor: new Date("2026-08-24T00:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    } as CompanySettings;
    expect(periodStartForOccurrence(settings, new Date("2026-08-24T16:00:00.000Z"))).toBe("2026-08-24");
  });

  it("does not invent a schedule when either setting is absent", () => {
    expect(approvalOpensAt({
      periodEnd: "2026-09-06",
      timeZone: "America/Los_Angeles",
      approvalDelayDays: null,
      approvalOpenLocalTime: null,
    })).toBeNull();
  });

  it("treats a period as complete only after its final local day", () => {
    expect(isCompletedPeriod(
      "2026-09-06",
      "America/Los_Angeles",
      DateTime.fromISO("2026-09-06T23:59:59", { zone: "America/Los_Angeles" }) as DateTime<true>,
    )).toBe(false);
    expect(isCompletedPeriod(
      "2026-09-06",
      "America/Los_Angeles",
      DateTime.fromISO("2026-09-07T00:00:00", { zone: "America/Los_Angeles" }) as DateTime<true>,
    )).toBe(true);
  });
});

describe("payroll snapshots", () => {
  it("hashes the frozen report content deterministically", () => {
    const report = { companyName: "TRESA", periodStart: "2026-08-24", periodEnd: "2026-09-06" } as CompanyPayPeriodReport;
    expect(snapshotHash(report)).toBe(snapshotHash(report));
    expect(snapshotHash({ ...report, companyName: "Changed" })).not.toBe(snapshotHash(report));
  });
});
