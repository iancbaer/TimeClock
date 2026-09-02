import type { PayPeriodApproval } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { activeApproval, databaseDate, type CompanyPayPeriodReport } from "@/lib/payroll";
import { buildConsolidatedPayrollCsv } from "@/lib/payroll-export";
import { buildCompanyPayPeriodReport } from "@/lib/timesheets";

const periodSchema = z.iso.date();

export async function GET(request: Request, context: { params: Promise<{ periodStart: string }> }) {
  try {
    await requireAdmin();
    const { periodStart: rawPeriodStart } = await context.params;
    const periodStart = periodSchema.parse(rawPeriodStart);
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "draft";
    const requestedVersion = params.get("version");
    let report: CompanyPayPeriodReport;
    let approval: (PayPeriodApproval & { approvedBy: { name: string; email: string } }) | null = null;
    let filenameStatus = "draft";

    if (mode === "approved") {
      if (requestedVersion) {
        approval = await prisma.payPeriodApproval.findUnique({
          where: { periodStart_version: { periodStart: databaseDate(periodStart), version: Number(requestedVersion) } },
          include: { approvedBy: { select: { name: true, email: true } } },
        });
        if (!approval) throw new HttpError(404, "That approved report version was not found.");
        filenameStatus = `approval-v${approval.version}-historical`;
      } else {
        const current = await activeApproval(periodStart);
        if (!current) throw new HttpError(409, "Approve this pay period before downloading a payroll-final report.");
        if (current.staleAt) throw new HttpError(409, "A late record changed this period. Reopen and approve it again before downloading a payroll-final report.", "APPROVAL_STALE");
        approval = current;
        filenameStatus = `approved-v${current.version}`;
      }
      report = approval.reportSnapshot as unknown as CompanyPayPeriodReport;
    } else if (mode === "draft") {
      report = await buildCompanyPayPeriodReport(periodStart);
      if (report.periodStart !== periodStart) throw new HttpError(400, "Choose the first day of a configured pay period.");
    } else {
      throw new HttpError(400, "Export mode must be draft or approved.");
    }

    const csv = buildConsolidatedPayrollCsv(report, approval);
    const filename = `TimeClock-${periodStart}-${filenameStatus}.csv`;
    return new NextResponse(csv, {
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
