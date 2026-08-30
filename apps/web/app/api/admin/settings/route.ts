import { DateTime, IANAZone } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { getSettings } from "@/lib/settings";

const schema = z.object({
  companyName: z.string().trim().min(1).max(120),
  timeZone: z.string().refine((value) => IANAZone.isValidZone(value), "Enter a valid IANA time zone."),
  payPeriodAnchor: z.iso.date(),
  workweekStartsOn: z.number().int().min(1).max(7),
  roundingMode: z.enum(["EXACT", "EMPLOYEE_FAVOR_DAILY_CEILING"]),
  roundingIntervalMinutes: z.literal(15),
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
          metadata: { roundingMode: input.roundingMode, roundingIntervalMinutes: 15 },
        },
      });
      return updated;
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
