import { calculateTimesheet, payPeriodContaining } from "@nanshe/core";
import { DateTime } from "luxon";
import { prisma } from "./db";
import { HttpError } from "./http";
import { effectivePunchesForEmployee } from "./punches";
import { getSettings } from "./settings";

export async function buildEmployeeTimesheet(employeeId: string, requestedPeriodStart?: string) {
  const [employee, settings] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    getSettings(),
  ]);
  if (!employee) throw new HttpError(404, "Employee not found.", "NOT_FOUND");

  const anchor = DateTime.fromJSDate(settings.payPeriodAnchor, { zone: "utc" })
    .setZone(settings.timeZone)
    .toISODate()!;
  const target = requestedPeriodStart ?? DateTime.now().setZone(settings.timeZone).toISODate()!;
  const periodStart = payPeriodContaining(anchor, target, settings.timeZone);
  const start = DateTime.fromISO(periodStart, { zone: settings.timeZone }).startOf("day");
  const end = start.plus({ days: 14 });
  const punches = await effectivePunchesForEmployee(
    employeeId,
    start.minus({ days: 2 }).toUTC().toJSDate(),
    end.plus({ days: 2 }).toUTC().toJSDate(),
  );
  const corrections = await prisma.correctionRequest.findMany({
    where: {
      employeeId,
      OR: [
        { requestedOccurredAt: { gte: start.toUTC().toJSDate(), lt: end.toUTC().toJSDate() } },
        { submittedAt: { gte: start.toUTC().toJSDate(), lt: end.plus({ days: 30 }).toUTC().toJSDate() } },
      ],
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      kind: true,
      note: true,
      status: true,
      requestedType: true,
      requestedOccurredAt: true,
      submittedAt: true,
      resolvedAt: true,
      resolutionNote: true,
      targetPunch: { select: { id: true, type: true, occurredAt: true } },
      createdPunch: { select: { id: true, type: true, occurredAt: true } },
      resolvedBy: { select: { name: true } },
    },
  });

  return {
    employee: {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      active: employee.active,
      codeConfigured: Boolean(employee.clockCodeHash),
    },
    settings: {
      companyName: settings.companyName,
      timeZone: settings.timeZone,
      roundingMode: settings.roundingMode,
      roundingIntervalMinutes: settings.roundingIntervalMinutes,
    },
    summary: calculateTimesheet(punches, {
      timeZone: settings.timeZone,
      roundingMode: settings.roundingMode,
      roundingIntervalMinutes: settings.roundingIntervalMinutes,
      payPeriodStart: periodStart,
    }),
    corrections,
    report: {
      generatedAt: new Date().toISOString(),
      calculationVersion: "NANSHE-CALCULATION-1",
      approvalState: "DRAFT_REVIEW_RECORD",
    },
  };
}
