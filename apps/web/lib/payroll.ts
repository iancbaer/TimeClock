import { createHash } from "node:crypto";
import type { CompanySettings, Prisma, PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import { payPeriodContaining } from "@timeclock/core";
import { prisma } from "./db";
import { buildCompanyPayPeriodReport } from "./timesheets";

type PayrollDatabase = Prisma.TransactionClient | PrismaClient;
export type CompanyPayPeriodReport = Awaited<
  ReturnType<typeof buildCompanyPayPeriodReport>
>;

export interface PayrollBlocker {
  type: "ACCURACY_FLAG" | "PENDING_CORRECTION";
  employeeId: string;
  employeeName: string;
  message: string;
}

export function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function periodStartForOccurrence(
  settings: CompanySettings,
  occurredAt: Date,
): string {
  const anchor = DateTime.fromJSDate(settings.payPeriodAnchor, {
    zone: "utc",
  }).toISODate()!;
  const target = DateTime.fromJSDate(occurredAt, { zone: "utc" })
    .setZone(settings.timeZone)
    .toISODate()!;
  return payPeriodContaining(anchor, target, settings.timeZone);
}

export function approvalOpensAt(input: {
  periodEnd: string;
  timeZone: string;
  approvalDelayDays: number | null;
  approvalOpenLocalTime: string | null;
}): DateTime | null {
  if (input.approvalDelayDays === null || input.approvalOpenLocalTime === null)
    return null;
  const [hour, minute] = input.approvalOpenLocalTime.split(":").map(Number);
  const opensAt = DateTime.fromISO(input.periodEnd, { zone: input.timeZone })
    .plus({ days: input.approvalDelayDays })
    .set({ hour, minute, second: 0, millisecond: 0 });
  return opensAt.isValid ? opensAt : null;
}

export function isCompletedPeriod(
  periodEnd: string,
  timeZone: string,
  now = DateTime.now(),
): boolean {
  const endExclusive = DateTime.fromISO(periodEnd, { zone: timeZone })
    .plus({ days: 1 })
    .startOf("day");
  return now.setZone(timeZone) >= endExclusive;
}

export function buildPayrollBlockers(
  report: CompanyPayPeriodReport,
): PayrollBlocker[] {
  const blockers: PayrollBlocker[] = [];
  for (const sheet of report.employees) {
    const employeeName = `${sheet.employee.firstName} ${sheet.employee.lastName}`;
    for (const item of sheet.summary.issues) {
      blockers.push({
        type: "ACCURACY_FLAG",
        employeeId: sheet.employee.id,
        employeeName,
        message: `${item.localDate}: ${item.message}`,
      });
    }
    for (const correction of sheet.corrections.filter(
      (item) => item.status === "PENDING",
    )) {
      blockers.push({
        type: "PENDING_CORRECTION",
        employeeId: sheet.employee.id,
        employeeName,
        message: `Pending ${correction.kind.replaceAll("_", " ").toLowerCase()}: ${correction.note}`,
      });
    }
  }
  return blockers;
}

export function freezeReport(
  report: CompanyPayPeriodReport,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue;
}

export function snapshotHash(
  report: CompanyPayPeriodReport | Prisma.InputJsonValue,
): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}

export async function lockPayPeriod(
  tx: Prisma.TransactionClient,
  periodStart: string,
): Promise<void> {
  await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext(${`timeclock-pay-period:${periodStart}`}))) SELECT 1::int AS "locked" FROM acquired`;
}

export async function activeApproval(
  periodStart: string,
  db: PayrollDatabase = prisma,
) {
  return db.payPeriodApproval.findFirst({
    where: { periodStart: databaseDate(periodStart), status: "APPROVED" },
    orderBy: { version: "desc" },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      reopenedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function approvalHistory(
  periodStart: string,
  db: PayrollDatabase = prisma,
) {
  return db.payPeriodApproval.findMany({
    where: { periodStart: databaseDate(periodStart) },
    orderBy: { version: "desc" },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      reopenedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function markPeriodApprovalStale(
  tx: Prisma.TransactionClient,
  periodStart: string,
  reason: string,
  entityId: string,
): Promise<boolean> {
  const approval = await tx.payPeriodApproval.findFirst({
    where: {
      periodStart: databaseDate(periodStart),
      status: "APPROVED",
      staleAt: null,
    },
    orderBy: { version: "desc" },
  });
  if (!approval) return false;
  const staleAt = new Date();
  await tx.payPeriodApproval.update({
    where: { id: approval.id },
    data: { staleAt, staleReason: reason },
  });
  await tx.auditEvent.create({
    data: {
      action: "PAY_PERIOD_APPROVAL_STALE",
      actorType: "SYSTEM",
      entityType: "PayPeriodApproval",
      entityId: approval.id,
      metadata: { periodStart, reason, changedEntityId: entityId },
    },
  });
  return true;
}
