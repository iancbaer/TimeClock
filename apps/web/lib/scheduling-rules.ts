import { DateTime } from "luxon";
import { z } from "zod";
import { HttpError } from "./http";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => DateTime.fromISO(value, { zone: "UTC" }).isValid, "Enter a valid date.");
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const shiftInput = z.object({
  employeeId: z.string().min(1), startsAt: localTime, endsAt: localTime,
  note: z.string().trim().max(1000).default(""),
});
export const recurringShiftInput = shiftInput.extend({
  publish: z.boolean().default(false),
  recurrence: z.object({ intervalWeeks: z.number().int().min(1).max(12), weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), untilDate: calendarDate.nullable() }).optional(),
});
const scope = { scope: z.enum(["ONE", "FOLLOWING"]).default("ONE"), seriesVersion: z.number().int().positive().optional() };
export const shiftAction = z.discriminatedUnion("action", [
  shiftInput.extend({ action: z.literal("SAVE"), version: z.number().int().positive(), ...scope }),
  z.object({ action: z.enum(["PUBLISH", "CANCEL"]), version: z.number().int().positive(), ...scope }),
]);
export const timeOffInput = z.object({
  startDate: calendarDate, endDate: calendarDate, note: z.string().trim().max(1000).default(""),
}).refine((value) => value.endDate >= value.startDate, "End date must be on or after the start date.");
export const decisionInput = z.object({ decision: z.enum(["APPROVED", "DENIED"]), cancelConflictingShifts: z.boolean().default(false) });
export const attendanceInput = z.object({employeeId:z.string().min(1), date:calendarDate, kind:z.enum(["SICK","NO_CALL_NO_SHOW"]), note:z.string().trim().max(1000).default("")});
export const attendanceVoidInput = z.object({id:z.string().min(1),version:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)});

export function expandRecurringShift(input: z.infer<typeof recurringShiftInput>, zone: string, window?: {from:string;to:string}) {
  const first = shiftBounds(input.startsAt, input.endsAt, zone);
  if (!input.recurrence) return [first];
  const start = DateTime.fromISO(input.startsAt.slice(0,10),{zone:"UTC"});
  const end = DateTime.fromISO(input.endsAt.slice(0,10),{zone:"UTC"});
  const until = DateTime.fromISO(window?.to ?? input.recurrence.untilDate ?? start.plus({weeks:12}).toISODate()!,{zone:"UTC"});
  if (!window && input.recurrence.untilDate && (until < start || until > start.plus({years:2}))) throw new HttpError(400,"Choose a repeat end date within two years of the first shift, or continue until cancelled.");
  const dayOffset = end.diff(start,"days").days;
  if (dayOffset > 1) throw new HttpError(400,"A repeating shift must end on the same or following day.");
  const result: {startsAt:Date;endsAt:Date}[]=[];
  const from=window ? DateTime.max(start,DateTime.fromISO(window.from,{zone:"UTC"})) : start;
  for(let day=from;day<=until;day=day.plus({days:1})) {
    const weeks=Math.floor(day.diff(start.startOf("week"),"days").days/7);
    if(weeks % input.recurrence.intervalWeeks || !input.recurrence.weekdays.includes(day.weekday)) continue;
    const localStart=`${day.toISODate()}T${input.startsAt.slice(11)}`;
    const localEnd=`${day.plus({days:dayOffset}).toISODate()}T${input.endsAt.slice(11)}`;
    let bounds: {startsAt:Date;endsAt:Date};
    if(input.recurrence.untilDate===null) {
      // Continuing rules move nonexistent DST times forward and choose the first
      // occurrence of repeated clock times. A spring gap must not stop the series.
      const earliest=(value:string)=>DateTime.fromISO(value,{zone}).getPossibleOffsets().sort((a,b)=>a.toMillis()-b.toMillis())[0];
      const startsAt=earliest(localStart);
      let endsAt=earliest(localEnd);
      if(endsAt<=startsAt) endsAt=startsAt.plus({minutes:DateTime.fromISO(localEnd,{zone:"UTC"}).diff(DateTime.fromISO(localStart,{zone:"UTC"}),"minutes").minutes});
      bounds={startsAt:startsAt.toJSDate(),endsAt:endsAt.toJSDate()};
    } else bounds=shiftBounds(localStart,localEnd,zone);
    if(result.some(previous=>overlaps(previous,bounds))) throw new HttpError(400,"Repeating shifts overlap each other. Adjust the days or times.");
    result.push(bounds);
    if(result.length>520) throw new HttpError(400,"Use a shorter repeat period (maximum 520 shifts).");
  }
  if(!result.length && !window) throw new HttpError(400,"No selected weekdays occur before the repeat end date.");
  return result;
}

export function shiftBounds(start: string, end: string, zone: string) {
  const parse = (value: string) => {
    const dt = DateTime.fromISO(value, { zone });
    if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== value || dt.getPossibleOffsets().length !== 1) {
      throw new HttpError(400, "Choose a valid, unambiguous local time. This time may fall within a daylight-saving clock change.");
    }
    return dt;
  };
  const startsAt = parse(start), endsAt = parse(end);
  if (endsAt <= startsAt) throw new HttpError(400, "Shift end must be after its start; use the following date for an overnight shift.");
  return { startsAt: startsAt.toJSDate(), endsAt: endsAt.toJSDate() };
}

export function timeOffBounds(start: string, end: string, zone: string) {
  return {
    startsAt: DateTime.fromISO(start, { zone }).startOf("day").toJSDate(),
    endsAt: DateTime.fromISO(end, { zone }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

export function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
