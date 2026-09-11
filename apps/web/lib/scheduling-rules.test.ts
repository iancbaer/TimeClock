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

import {expandRecurringShift,recurringShiftInput} from './scheduling-rules';
it('recurs at the same local hour across daylight-saving changes and respects interval weeks',()=>{
 const rows=expandRecurringShift(recurringShiftInput.parse({employeeId:'test',startsAt:'2026-10-26T09:00',endsAt:'2026-10-26T17:00',recurrence:{intervalWeeks:1,weekdays:[1],untilDate:'2026-11-09'}}),'America/Los_Angeles');
 expect(rows.map(r=>r.startsAt.toISOString())).toEqual(['2026-10-26T16:00:00.000Z','2026-11-02T17:00:00.000Z','2026-11-09T17:00:00.000Z']);
 const alternating=expandRecurringShift(recurringShiftInput.parse({employeeId:'test',startsAt:'2026-10-26T22:00',endsAt:'2026-10-27T06:00',recurrence:{intervalWeeks:2,weekdays:[1],untilDate:'2026-11-09'}}),'America/Los_Angeles');
 expect(alternating).toHaveLength(2);expect(alternating[1].endsAt.toISOString()).toBe('2026-11-10T14:00:00.000Z');
});
it('rejects empty repeat ranges and a DST-invalid occurrence instead of silently moving it',()=>{
 const base={employeeId:'test',startsAt:'2026-03-01T02:30',endsAt:'2026-03-01T04:30',recurrence:{intervalWeeks:1,weekdays:[7],untilDate:'2026-03-08'}};
 expect(()=>expandRecurringShift(recurringShiftInput.parse(base),'America/Los_Angeles')).toThrow('daylight-saving');
 expect(()=>expandRecurringShift(recurringShiftInput.parse({...base,recurrence:{...base.recurrence,weekdays:[1],untilDate:'2026-03-01'}}),'America/Los_Angeles')).toThrow('No selected');
});
it('keeps continuing rules valid through missing and repeated DST times',()=>{
 const rule=recurringShiftInput.parse({employeeId:'test',startsAt:'2030-01-06T02:30',endsAt:'2030-01-06T03:30',recurrence:{intervalWeeks:1,weekdays:[7],untilDate:null}});
 const gap=expandRecurringShift(rule,zone,{from:'2030-03-10',to:'2030-03-10'});
 expect(gap[0].startsAt.toISOString()).toBe('2030-03-10T10:30:00.000Z');
 expect(gap[0].endsAt.getTime()-gap[0].startsAt.getTime()).toBe(3600000);
 const repeated=expandRecurringShift({...rule,startsAt:'2030-01-06T01:30',endsAt:'2030-01-06T02:30'},zone,{from:'2030-11-03',to:'2030-11-03'});
 expect(repeated[0].startsAt.toISOString()).toBe('2030-11-03T08:30:00.000Z');
});
