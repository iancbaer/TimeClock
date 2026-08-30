import { allowedPunchTypes } from "@timeclock/core";
import { NextResponse } from "next/server";
import { HttpError, errorResponse } from "@/lib/http";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { prisma } from "@/lib/db";
import { toEffectivePunch } from "@/lib/punches";
import { punchSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const input = punchSchema.parse(await request.json());
    const [employee, settings] = await Promise.all([requireKioskSession(request), getSettings()]);

    const punch = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext(${employee.id}))) SELECT 1::int AS "locked" FROM acquired`;
      const duplicate = await tx.punch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) {
        if (duplicate.employeeId !== employee.id) throw new HttpError(409, "That request key is already in use.");
        return duplicate;
      }

      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rawPunches = await tx.punch.findMany({
        where: { employeeId: employee.id, occurredAt: { gte: from } },
        include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { occurredAt: "asc" },
      });
      const effective = rawPunches.map(toEffectivePunch).filter((item) => item !== null);
      const allowed = allowedPunchTypes(effective);
      if (!allowed.includes(input.type)) {
        throw new HttpError(
          409,
          `That punch is not valid right now. Available action: ${allowed.join(" or ").replaceAll("_", " ").toLowerCase()}.`,
          "INVALID_CLOCK_STATE",
        );
      }

      const created = await tx.punch.create({
        data: {
          employeeId: employee.id,
          type: input.type,
          occurredAt: new Date(),
          source: "KIOSK",
          idempotencyKey: input.idempotencyKey,
          deviceLabel: input.deviceLabel,
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "PUNCH_RECORDED",
          actorType: "EMPLOYEE",
          actorId: employee.id,
          entityType: "Punch",
          entityId: created.id,
          metadata: { type: created.type, source: created.source, deviceLabel: created.deviceLabel },
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(
      {
        punch: { id: punch.id, type: punch.type, occurredAt: punch.occurredAt },
        timeZone: settings.timeZone,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
