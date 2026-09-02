import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { activeApproval, lockPayPeriod } from "@/lib/payroll";

const periodSchema = z.iso.date();
const schema = z.object({ reason: z.string().trim().min(5).max(2000) });

export async function POST(
  request: Request,
  context: { params: Promise<{ periodStart: string }> },
) {
  try {
    const [admin, { periodStart: rawPeriodStart }, input] = await Promise.all([
      requireAdmin(),
      context.params,
      request.json().then((body) => schema.parse(body)),
    ]);
    const periodStart = periodSchema.parse(rawPeriodStart);
    const reopened = await prisma.$transaction(async (tx) => {
      await lockPayPeriod(tx, periodStart);
      const current = await activeApproval(periodStart, tx);
      if (!current)
        throw new HttpError(
          409,
          "This pay period does not have an active approval to reopen.",
        );
      const updated = await tx.payPeriodApproval.update({
        where: { id: current.id },
        data: {
          status: "REOPENED",
          reopenedAt: new Date(),
          reopenedById: admin.id,
          reopenReason: input.reason,
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "PAY_PERIOD_REOPENED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "PayPeriodApproval",
          entityId: updated.id,
          metadata: {
            periodStart,
            version: updated.version,
            reason: input.reason,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ approval: reopened });
  } catch (error) {
    return errorResponse(error);
  }
}
