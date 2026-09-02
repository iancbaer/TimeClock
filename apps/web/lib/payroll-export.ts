import { formatDuration } from "@timeclock/core";
import type { CompanyPayPeriodReport } from "./payroll";

interface ApprovalExportMetadata {
  version: number;
  approvedAt: Date | string;
  approvedBy: { name: string; email: string };
  snapshotHash: string;
  blockerJustification?: string | null;
  status?: string;
  staleAt?: Date | string | null;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function buildConsolidatedPayrollCsv(
  report: CompanyPayPeriodReport,
  approval?: ApprovalExportMetadata | null,
): string {
  const status = approval
    ? approval.status === "APPROVED" && !approval.staleAt ? "APPROVED — PAYROLL FINAL" : "HISTORICAL APPROVAL — NOT CURRENT"
    : "DRAFT — NOT APPROVED";
  const rows: unknown[][] = [
    ["Document", "TimeClock consolidated pay-period report"],
    ["Status", status],
    ["Company", report.companyName],
    ["Pay period", `${report.periodStart} through ${report.periodEnd}`],
    ["Time zone", report.timeZone],
    ["Generated", report.generatedAt],
    ["Calculation version", report.calculationVersion],
  ];
  if (approval) {
    rows.push(
      ["Approval version", approval.version],
      ["Approved by", `${approval.approvedBy.name} <${approval.approvedBy.email}>`],
      ["Approved at", new Date(approval.approvedAt).toISOString()],
      ["Snapshot SHA-256", approval.snapshotHash],
      ["Unresolved-item justification", approval.blockerJustification ?? ""],
    );
  }
  rows.push(
    [],
    ["Company totals"],
    ["Exact worked", formatDuration(report.totals.actualMilliseconds)],
    ["Paid time credit", formatDuration(report.totals.creditMilliseconds)],
    ["Regular payable", formatDuration(report.totals.regularMilliseconds)],
    ["Overtime payable", formatDuration(report.totals.overtimeMilliseconds)],
    ["Total payable", formatDuration(report.totals.payableMilliseconds)],
    [],
    ["Employee number", "Employee", "Exact", "Credit", "Regular", "Overtime", "Total payable", "Flags", "Pending corrections"],
  );
  for (const sheet of report.employees) {
    rows.push([
      sheet.employee.employeeNumber,
      `${sheet.employee.firstName} ${sheet.employee.lastName}`,
      formatDuration(sheet.summary.actualMilliseconds),
      formatDuration(sheet.summary.creditMilliseconds),
      formatDuration(sheet.summary.regularMilliseconds),
      formatDuration(sheet.summary.overtimeMilliseconds),
      formatDuration(sheet.summary.payableMilliseconds),
      sheet.summary.issues.length,
      sheet.corrections.filter((item) => item.status === "PENDING").length,
    ]);
  }
  rows.push(
    [],
    ["Employee number", "Employee", "Week", "Date", "Punches", "Exact", "Credit", "Payable", "Issues"],
  );
  for (const sheet of report.employees) {
    for (const week of sheet.summary.weeks) {
      for (const day of week.days) {
        rows.push([
          sheet.employee.employeeNumber,
          `${sheet.employee.firstName} ${sheet.employee.lastName}`,
          week.weekNumber,
          day.date,
          day.punches.map((punch) => `${punch.type}:${punch.localTime}${punch.revised ? " (revised)" : ""}`).join(" | "),
          formatDuration(day.actualMilliseconds),
          formatDuration(day.creditMilliseconds),
          formatDuration(day.payableMilliseconds),
          day.issues.map((item) => item.message).join(" | "),
        ]);
      }
    }
  }
  rows.push([], ["Correction history"]);
  for (const sheet of report.employees) {
    for (const correction of sheet.corrections) {
      rows.push([
        sheet.employee.employeeNumber,
        `${sheet.employee.firstName} ${sheet.employee.lastName}`,
        correction.status,
        correction.kind,
        new Date(correction.submittedAt).toISOString(),
        correction.note,
        correction.resolutionNote ?? "",
        correction.resolvedBy?.name ?? "",
      ]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
