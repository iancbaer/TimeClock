import { DateTime } from "luxon";
import { z } from "zod";
import { HttpError } from "./http";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => DateTime.fromISO(value, { zone: "UTC" }).isValid, "Enter a valid date.");
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const shiftInput = z.object({
  employeeId: z.string().min(1), startsAt: localTime, endsAt: localTime,
  note: z.string().trim().max(1000).default(""),
});
export const shiftAction = z.discriminatedUnion("action", [
  shiftInput.extend({ action: z.literal("SAVE"), version: z.number().int().positive() }),
  z.object({ action: z.enum(["PUBLISH", "CANCEL"]), version: z.number().int().positive() }),
]);
export const timeOffInput = z.object({
  startDate: calendarDate, endDate: calendarDate, note: z.string().trim().max(1000).default(""),
}).refine((value) => value.endDate >= value.startDate, "End date must be on or after the start date.");
export const decisionInput = z.object({ decision: z.enum(["APPROVED", "DENIED"]) });

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
