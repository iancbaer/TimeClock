import { NextResponse } from "next/server";
import { HttpError, errorResponse } from "@/lib/http";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { prisma } from "@/lib/db";
import {
  lockPayPeriod,
  markPeriodApprovalStale,
  periodStartForOccurrence,
} from "@/lib/payroll";
import { correctionSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const input = correctionSchema.parse(await request.json());
    const employee = await requireKioskSession(request);
    if (
      input.kind === "WRONG_TIME" &&
      (!input.targetPunchId || !input.requestedOccurredAt)
    ) {
      throw new HttpError(
        400,
        "Choose the incorrect punch and enter the requested time.",
      );
    }
    if (
      input.kind === "MISSED_PUNCH" &&
      (!input.requestedType || !input.requestedOccurredAt)
    ) {
      throw new HttpError(
        400,
        "Choose the missed punch type and enter the requested time.",
      );
    }
    let targetOccurredAt: Date | null = null;
    if (input.targetPunchId) {
      const target = await prisma.punch.findFirst({
        where: { id: input.targetPunchId, employeeId: employee.id },
        select: { id: true, occurredAt: true },
      });
      if (!target)
        throw new HttpError(
          400,
          "The selected punch does not belong to this employee.",
        );
      targetOccurredAt = target.occurredAt;
    }

    const correction = await prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const requestedOccurredAt = input.requestedOccurredAt
        ? new Date(input.requestedOccurredAt)
        : null;
      const affectedAt = requestedOccurredAt ?? targetOccurredAt ?? new Date();
      const periodStart = periodStartForOccurrence(settings, affectedAt);
      await lockPayPeriod(tx, periodStart);
      const created = await tx.correctionRequest.create({
        data: {
          employeeId: employee.id,
          targetPunchId: input.targetPunchId,
          kind: input.kind,
          requestedType: input.requestedType,
          requestedOccurredAt,
          note: input.note,
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "CORRECTION_REQUESTED",
          actorType: "EMPLOYEE",
          actorId: employee.id,
          entityType: "CorrectionRequest",
          entityId: created.id,
          metadata: {
            kind: created.kind,
            targetPunchId: created.targetPunchId,
          },
        },
      });
      await markPeriodApprovalStale(
        tx,
        periodStart,
        "A correction request was submitted after approval.",
        created.id,
      );
      return created;
    });
    return NextResponse.json(
      { correction: { id: correction.id, status: correction.status } },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
