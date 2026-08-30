import { formatDuration } from "@timeclock/core";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { buildEmployeeTimesheet } from "@/lib/timesheets";

function csv(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const periodStart = new URL(request.url).searchParams.get("periodStart") ?? undefined;
    const sheet = await buildEmployeeTimesheet(id, periodStart);
    const rows = [
      ["Document", "TimeClock pay-period evidence export"],
      ["Purpose", "Review exact recorded time, corrections, calculation results, and payroll exceptions"],
      ["Status", "Draft review record; export does not approve or freeze the pay period"],
      ["Generated at", sheet.report.generatedAt],
      ["Calculation version", sheet.report.calculationVersion],
      ["Employee", `${sheet.employee.firstName} ${sheet.employee.lastName}`],
      ["Official employee number", sheet.employee.employeeNumber],
      ["Record ID", sheet.employee.id],
      ["Pay period", `${sheet.summary.periodStart} through ${sheet.summary.periodEnd}`],
      [],
      ["Week", "Date", "Punches", "Actual", "Paid time credit", "Payable", "Issues"],
    ];
    for (const week of sheet.summary.weeks) {
      for (const day of week.days) {
        rows.push([
          String(week.weekNumber),
          day.date,
          day.punches.map((punch) => `${punch.type}:${punch.localTime}`).join(" | "),
          formatDuration(day.actualMilliseconds),
          formatDuration(day.creditMilliseconds),
          formatDuration(day.payableMilliseconds),
          day.issues.map((item) => item.message).join(" | "),
        ]);
      }
    }
    rows.push(
      [],
      ["Period totals", "", "", formatDuration(sheet.summary.actualMilliseconds), formatDuration(sheet.summary.creditMilliseconds), formatDuration(sheet.summary.payableMilliseconds), ""],
      ["Regular payable", formatDuration(sheet.summary.regularMilliseconds)],
      ["Overtime payable", formatDuration(sheet.summary.overtimeMilliseconds)],
      [],
      ["Correction history"],
      ["Status", "Kind", "Submitted", "Requested action", "Requested time", "Worker explanation", "Manager resolution"],
    );
    for (const correction of sheet.corrections) {
      rows.push([
        correction.status,
        correction.kind,
        correction.submittedAt.toISOString(),
        correction.requestedType ?? "",
        correction.requestedOccurredAt?.toISOString() ?? "",
        correction.note,
        correction.resolutionNote ?? "",
      ]);
    }
    const body = rows.map((row) => row.map(csv).join(",")).join("\r\n");
    const filename = `${sheet.employee.lastName}-${sheet.employee.firstName}-${sheet.summary.periodStart}.csv`
      .replaceAll(/[^a-zA-Z0-9.-]/g, "-");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
