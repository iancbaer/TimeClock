import { DateTime, IANAZone } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { overlaps, timeOffBounds } from "@/lib/scheduling-rules";

const schema = z.object({
  companyName: z.string().trim().min(1).max(120),
  timeZone: z.string().refine((value) => IANAZone.isValidZone(value), "Enter a valid IANA time zone."),
  payPeriodAnchor: z.iso.date(),
  workweekStartsOn: z.number().int().min(1).max(7),
  roundingMode: z.enum(["EXACT", "EMPLOYEE_FAVOR_DAILY_CEILING"]),
  roundingIntervalMinutes: z.literal(15),
  approvalDelayDays: z.number().int().min(1).max(14).nullable(),
  approvalOpenLocalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).superRefine((value, context) => {
  if ((value.approvalDelayDays === null) !== (value.approvalOpenLocalTime === null)) {
    context.addIssue({ code: "custom", path: ["approvalOpenLocalTime"], message: "Choose both an approval day and time, or leave both unset." });
  }
});

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getSettings();
    return NextResponse.json({
      settings: {
        ...settings,
        payPeriodAnchor: DateTime.fromJSDate(settings.payPeriodAnchor, { zone: "utc" }).toISODate(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = schema.parse(await request.json());
    const anchor = DateTime.fromISO(input.payPeriodAnchor, { zone: input.timeZone });
    if (anchor.weekday !== input.workweekStartsOn) {
      throw new HttpError(400, "The pay-period anchor must begin on the configured workweek day.");
    }
    const settings = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext('timeclock-scheduling'))) SELECT 1::int FROM acquired`;
      const previous = await tx.companySettings.findUnique({ where: { id: "default" } });
      if (previous && previous.timeZone !== input.timeZone) {
        const leave = await tx.timeOffRequest.findMany({ where: { status: "APPROVED" } });
        const shifts = await tx.shift.findMany({ where: { status: { not: "CANCELLED" } } });
        if (leave.some((item) => shifts.some((shift) => shift.employeeId === item.employeeId && overlaps(shift, timeOffBounds(item.startDate.toISOString().slice(0, 10), item.endDate.toISOString().slice(0, 10), input.timeZone))))) {
          throw new HttpError(409, "This timezone change would make a shift conflict with approved time off. Resolve the shift first.");
        }
      }
      const updated = await tx.companySettings.upsert({
        where: { id: "default" },
        update: {
          ...input,
          payPeriodAnchor: new Date(`${input.payPeriodAnchor}T00:00:00.000Z`),
        },
        create: {
          id: "default",
          ...input,
          payPeriodAnchor: new Date(`${input.payPeriodAnchor}T00:00:00.000Z`),
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "SETTINGS_UPDATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "CompanySettings",
          entityId: "default",
          metadata: {
            roundingMode: input.roundingMode,
            roundingIntervalMinutes: 15,
            approvalDelayDays: input.approvalDelayDays,
            approvalOpenLocalTime: input.approvalOpenLocalTime,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
