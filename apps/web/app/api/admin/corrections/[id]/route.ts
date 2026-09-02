import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { activeApproval, lockPayPeriod, periodStartForOccurrence } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  resolutionNote: z.string().trim().min(3).max(1000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }] = await Promise.all([requireAdmin(), context.params]);
    const input = schema.parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const correction = await tx.correctionRequest.findUnique({ where: { id } });
      if (!correction) throw new HttpError(404, "Correction request not found.");
      if (correction.status !== "PENDING") throw new HttpError(409, "This correction has already been resolved.");

      const settings = await getSettings(tx);
      const targetPunch = correction.targetPunchId
        ? await tx.punch.findUnique({ where: { id: correction.targetPunchId }, select: { occurredAt: true } })
        : null;
      const affectedTimes = [targetPunch?.occurredAt, correction.requestedOccurredAt, correction.submittedAt]
        .filter((value): value is Date => Boolean(value));
      const affectedPeriods = [...new Set(affectedTimes.map((value) => periodStartForOccurrence(settings, value)))].sort();
      for (const periodStart of affectedPeriods) await lockPayPeriod(tx, periodStart);
      for (const periodStart of affectedPeriods) {
        if (await activeApproval(periodStart, tx)) {
          throw new HttpError(
            409,
            `The pay period beginning ${periodStart} is approved. Reopen it with a reason before resolving this correction.`,
            "PAY_PERIOD_APPROVED",
          );
        }
      }

      const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const claimed = await tx.correctionRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status,
          resolutionNote: input.resolutionNote,
          resolvedAt: new Date(),
          resolvedById: admin.id,
        },
      });
      if (claimed.count !== 1) throw new HttpError(409, "This correction has already been resolved.");

      if (status === "APPROVED") {
        if (correction.targetPunchId) {
          if (!correction.requestedOccurredAt && !correction.requestedType) {
            throw new HttpError(400, "This request does not contain a corrected time or punch type.");
          }
          await tx.punchRevision.create({
            data: {
              punchId: correction.targetPunchId,
              effectiveOccurredAt: correction.requestedOccurredAt,
              effectiveType: correction.requestedType,
              reason: input.resolutionNote,
              adminId: admin.id,
              correctionRequestId: correction.id,
            },
          });
        } else {
          if (!correction.requestedOccurredAt || !correction.requestedType) {
            throw new HttpError(400, "A missing punch request must include a time and punch type.");
          }
          await tx.punch.create({
            data: {
              employeeId: correction.employeeId,
              type: correction.requestedType,
              occurredAt: correction.requestedOccurredAt,
              source: "ADMIN_CORRECTION",
              correctionRequestId: correction.id,
            },
          });
        }
      }

      await tx.auditEvent.create({
        data: {
          action: status === "APPROVED" ? "CORRECTION_APPROVED" : "CORRECTION_REJECTED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "CorrectionRequest",
          entityId: correction.id,
          metadata: { targetPunchId: correction.targetPunchId, resolutionNote: input.resolutionNote },
        },
      });
      return { id: correction.id, status };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ correction: result });
  } catch (error) {
    return errorResponse(error);
  }
}
