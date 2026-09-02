import { calculateTimesheet, payPeriodContaining } from "@timeclock/core";
import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { HttpError } from "./http";
import { effectivePunchesForEmployee } from "./punches";
import { getSettings } from "./settings";

type TimesheetDatabase = Prisma.TransactionClient | PrismaClient;

export async function buildEmployeeTimesheet(
  employeeId: string,
  requestedPeriodStart?: string,
  db: TimesheetDatabase = prisma,
) {
  const [employee, settings] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId } }),
    getSettings(db),
  ]);
  if (!employee) throw new HttpError(404, "Employee not found.", "NOT_FOUND");

  const anchor = DateTime.fromJSDate(settings.payPeriodAnchor, { zone: "utc" }).toISODate()!;
  const target =
    requestedPeriodStart ??
    DateTime.now().setZone(settings.timeZone).toISODate()!;
  const periodStart = payPeriodContaining(anchor, target, settings.timeZone);
  const start = DateTime.fromISO(periodStart, {
    zone: settings.timeZone,
  }).startOf("day");
  const end = start.plus({ days: 14 });
  const punches = await effectivePunchesForEmployee(
    employeeId,
    start.minus({ days: 2 }).toUTC().toJSDate(),
    end.plus({ days: 2 }).toUTC().toJSDate(),
    db,
  );
  const corrections = await db.correctionRequest.findMany({
    where: {
      employeeId,
      OR: [
        {
          requestedOccurredAt: {
            gte: start.toUTC().toJSDate(),
            lt: end.toUTC().toJSDate(),
          },
        },
        {
          targetPunch: {
            occurredAt: {
              gte: start.toUTC().toJSDate(),
              lt: end.toUTC().toJSDate(),
            },
          },
        },
        {
          createdPunch: {
            occurredAt: {
              gte: start.toUTC().toJSDate(),
              lt: end.toUTC().toJSDate(),
            },
          },
        },
        {
          requestedOccurredAt: null,
          targetPunchId: null,
          submittedAt: {
            gte: start.toUTC().toJSDate(),
            lt: end.toUTC().toJSDate(),
          },
        },
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
      calculationVersion: "TIMECLOCK-CALCULATION-1",
      approvalState: "DRAFT_REVIEW_RECORD",
    },
  };
}

export async function buildManagerReview(
  requestedPeriodStart?: string,
  db: TimesheetDatabase = prisma,
) {
  const settings = await getSettings(db);
  const anchor = DateTime.fromJSDate(settings.payPeriodAnchor, {
    zone: "utc",
  }).toISODate()!;
  const target =
    requestedPeriodStart ??
    DateTime.now().setZone(settings.timeZone).toISODate()!;
  const periodStart = payPeriodContaining(anchor, target, settings.timeZone);
  const employees = await db.employee.findMany({
    where: { active: true },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
      { employeeNumber: "asc" },
    ],
    select: { id: true },
  });
  const sheets = await Promise.all(
    employees.map((employee) =>
      buildEmployeeTimesheet(employee.id, periodStart, db),
    ),
  );

  return {
    companyName: settings.companyName,
    timeZone: settings.timeZone,
    periodStart,
    periodEnd: DateTime.fromISO(periodStart, { zone: settings.timeZone })
      .plus({ days: 13 })
      .toISODate()!,
    generatedAt: new Date().toISOString(),
    recordSource: "central-database",
    employees: sheets.map((sheet) => ({
      employee: sheet.employee,
      summary: sheet.summary,
    })),
  };
}

export async function buildCompanyPayPeriodReport(
  requestedPeriodStart?: string,
  db: TimesheetDatabase = prisma,
) {
  const settings = await getSettings(db);
  const anchor = DateTime.fromJSDate(settings.payPeriodAnchor, { zone: "utc" }).toISODate()!;
  const target =
    requestedPeriodStart ??
    DateTime.now().setZone(settings.timeZone).toISODate()!;
  const periodStart = payPeriodContaining(anchor, target, settings.timeZone);
  const periodEnd = DateTime.fromISO(periodStart, { zone: settings.timeZone })
    .plus({ days: 13 })
    .toISODate()!;
  const employees = await db.employee.findMany({
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
      { employeeNumber: "asc" },
    ],
    select: { id: true },
  });
  const sheets = [];
  for (const employee of employees) {
    sheets.push(await buildEmployeeTimesheet(employee.id, periodStart, db));
  }
  const included = sheets.filter(
    (sheet) =>
      sheet.employee.active ||
      sheet.summary.weeks.some((week) =>
        week.days.some((day) => day.punches.length > 0),
      ) ||
      sheet.corrections.length > 0,
  );
  return {
    companyName: settings.companyName,
    timeZone: settings.timeZone,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    calculationVersion: "TIMECLOCK-CALCULATION-1",
    settings: {
      payPeriodAnchor: anchor,
      workweekStartsOn: settings.workweekStartsOn,
      roundingMode: settings.roundingMode,
      roundingIntervalMinutes: settings.roundingIntervalMinutes,
    },
    totals: {
      actualMilliseconds: included.reduce(
        (sum, sheet) => sum + sheet.summary.actualMilliseconds,
        0,
      ),
      creditMilliseconds: included.reduce(
        (sum, sheet) => sum + sheet.summary.creditMilliseconds,
        0,
      ),
      payableMilliseconds: included.reduce(
        (sum, sheet) => sum + sheet.summary.payableMilliseconds,
        0,
      ),
      regularMilliseconds: included.reduce(
        (sum, sheet) => sum + sheet.summary.regularMilliseconds,
        0,
      ),
      overtimeMilliseconds: included.reduce(
        (sum, sheet) => sum + sheet.summary.overtimeMilliseconds,
        0,
      ),
    },
    employees: included,
  };
}
