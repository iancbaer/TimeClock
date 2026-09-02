import type { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import {
  activeApproval,
  approvalHistory,
  approvalOpensAt,
  buildPayrollBlockers,
  databaseDate,
  freezeReport,
  isCompletedPeriod,
  lockPayPeriod,
  snapshotHash,
} from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { buildCompanyPayPeriodReport } from "@/lib/timesheets";

const periodSchema = z.iso.date();
const approvalSchema = z.object({
  justification: z.string().trim().min(5).max(2000).optional().nullable(),
});

function approvalMetadata<
  T extends {
    reportSnapshot: unknown;
    settingsSnapshot: unknown;
    blockersSnapshot: unknown;
  },
>(approval: T) {
  const metadata = { ...approval } as Record<string, unknown>;
  delete metadata.reportSnapshot;
  delete metadata.settingsSnapshot;
  delete metadata.blockersSnapshot;
  return metadata;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ periodStart: string }> },
) {
  try {
    await requireAdmin();
    const { periodStart: rawPeriodStart } = await context.params;
    const periodStart = periodSchema.parse(rawPeriodStart);
    const requestedVersion = new URL(request.url).searchParams.get("version");
    const [settings, liveReport, history] = await Promise.all([
      getSettings(),
      buildCompanyPayPeriodReport(periodStart),
      approvalHistory(periodStart),
    ]);
    if (liveReport.periodStart !== periodStart)
      throw new HttpError(
        400,
        "Choose the first day of a configured pay period.",
      );
    const currentApproval =
      history.find((item) => item.status === "APPROVED") ?? null;
    const versionApproval = requestedVersion
      ? (history.find((item) => item.version === Number(requestedVersion)) ??
        null)
      : null;
    if (requestedVersion && !versionApproval)
      throw new HttpError(404, "That approved report version was not found.");
    const displayedApproval =
      versionApproval ??
      (currentApproval && !currentApproval.staleAt ? currentApproval : null);
    const blockers = buildPayrollBlockers(liveReport);
    const opensAt = approvalOpensAt({
      periodEnd: liveReport.periodEnd,
      timeZone: settings.timeZone,
      approvalDelayDays: settings.approvalDelayDays,
      approvalOpenLocalTime: settings.approvalOpenLocalTime,
    });
    const completed = isCompletedPeriod(
      liveReport.periodEnd,
      settings.timeZone,
    );
    const available = Boolean(
      completed &&
      opensAt &&
      DateTime.now().setZone(settings.timeZone) >= opensAt,
    );
    const state = currentApproval
      ? currentApproval.staleAt
        ? "STALE"
        : "APPROVED"
      : history[0]?.status === "REOPENED"
        ? "REOPENED"
        : "DRAFT";
    return NextResponse.json(
      {
        report: displayedApproval
          ? displayedApproval.reportSnapshot
          : liveReport,
        reportSource: displayedApproval ? "APPROVED_SNAPSHOT" : "LIVE_DRAFT",
        selectedApproval: displayedApproval
          ? approvalMetadata(displayedApproval)
          : null,
        approval: {
          state,
          completed,
          available,
          opensAt: opensAt?.toUTC().toISO() ?? null,
          scheduleConfigured: Boolean(opensAt),
          canApprove: available && !currentApproval,
          blockers,
          current: currentApproval ? approvalMetadata(currentApproval) : null,
          history: history.map(approvalMetadata),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ periodStart: string }> },
) {
  try {
    const [admin, { periodStart: rawPeriodStart }, input] = await Promise.all([
      requireAdmin(),
      context.params,
      request.json().then((body) => approvalSchema.parse(body)),
    ]);
    const periodStart = periodSchema.parse(rawPeriodStart);
    const approval = await prisma.$transaction(async (tx) => {
      await lockPayPeriod(tx, periodStart);
      const settings = await getSettings(tx);
      const report = await buildCompanyPayPeriodReport(periodStart, tx);
      if (report.periodStart !== periodStart)
        throw new HttpError(
          400,
          "Choose the first day of a configured pay period.",
        );
      if (!isCompletedPeriod(report.periodEnd, settings.timeZone)) {
        throw new HttpError(
          409,
          "This pay period is still in progress.",
          "PAY_PERIOD_IN_PROGRESS",
        );
      }
      const opensAt = approvalOpensAt({
        periodEnd: report.periodEnd,
        timeZone: settings.timeZone,
        approvalDelayDays: settings.approvalDelayDays,
        approvalOpenLocalTime: settings.approvalOpenLocalTime,
      });
      if (!opensAt)
        throw new HttpError(
          409,
          "Configure the payroll approval day and time before approving hours.",
          "APPROVAL_SCHEDULE_REQUIRED",
        );
      if (DateTime.now().setZone(settings.timeZone) < opensAt) {
        throw new HttpError(
          409,
          `Approval opens ${opensAt.toLocaleString(DateTime.DATETIME_FULL)}.`,
          "APPROVAL_NOT_OPEN",
        );
      }
      if (await activeApproval(periodStart, tx))
        throw new HttpError(409, "This pay period is already approved.");
      const blockers = buildPayrollBlockers(report);
      const justification = input.justification?.trim() || null;
      if (blockers.length > 0 && !justification) {
        throw new HttpError(
          422,
          "Enter a justification to approve hours with unresolved items.",
          "APPROVAL_JUSTIFICATION_REQUIRED",
        );
      }
      const latest = await tx.payPeriodApproval.findFirst({
        where: { periodStart: databaseDate(periodStart) },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const frozenReport = freezeReport(report);
      const created = await tx.payPeriodApproval.create({
        data: {
          periodStart: databaseDate(periodStart),
          periodEnd: databaseDate(report.periodEnd),
          version: (latest?.version ?? 0) + 1,
          approvedById: admin.id,
          blockerJustification: justification,
          blockersSnapshot: blockers as unknown as Prisma.InputJsonValue,
          settingsSnapshot: {
            ...report.settings,
            companyName: report.companyName,
            timeZone: report.timeZone,
            approvalDelayDays: settings.approvalDelayDays,
            approvalOpenLocalTime: settings.approvalOpenLocalTime,
          },
          reportSnapshot: frozenReport,
          snapshotHash: snapshotHash(frozenReport),
        },
        include: {
          approvedBy: { select: { id: true, name: true, email: true } },
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "PAY_PERIOD_APPROVED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "PayPeriodApproval",
          entityId: created.id,
          metadata: {
            periodStart,
            periodEnd: report.periodEnd,
            version: created.version,
            blockerCount: blockers.length,
            justification,
            snapshotHash: created.snapshotHash,
          },
        },
      });
      return created;
    });
    return NextResponse.json(
      { approval: approvalMetadata(approval) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
