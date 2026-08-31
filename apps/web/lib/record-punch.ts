import { allowedPunchTypes } from "@timeclock/core";
import type { PunchType } from "@prisma/client";
import { prisma } from "./db";
import { HttpError } from "./http";
import { toEffectivePunch } from "./punches";

export async function recordEmployeePunch(input: {
  employeeId: string;
  type: "WORK_IN" | "WORK_OUT";
  occurredAt: Date;
  idempotencyKey: string;
  deviceLabel?: string;
  offlineQueued?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext(${input.employeeId}))) SELECT 1::int AS "locked" FROM acquired`;
    const duplicate = await tx.punch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (duplicate) {
      if (duplicate.employeeId !== input.employeeId) throw new HttpError(409, "That request key is already in use.");
      return duplicate;
    }

    const from = new Date(input.occurredAt.getTime() - 45 * 24 * 60 * 60 * 1000);
    const rawPunches = await tx.punch.findMany({
      where: { employeeId: input.employeeId, occurredAt: { gte: from, lte: input.occurredAt } },
      include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { occurredAt: "asc" },
    });
    const effective = rawPunches.map(toEffectivePunch).filter((item) => item !== null);
    const allowed = allowedPunchTypes(effective);
    if (!allowed.includes(input.type)) {
      throw new HttpError(409, `That punch is not valid right now. Available action: ${allowed.join(" or ").replaceAll("_", " ").toLowerCase()}.`, "INVALID_CLOCK_STATE");
    }

    const created = await tx.punch.create({
      data: {
        employeeId: input.employeeId,
        type: input.type as PunchType,
        occurredAt: input.occurredAt,
        source: "KIOSK",
        idempotencyKey: input.idempotencyKey,
        deviceLabel: input.deviceLabel,
      },
    });
    await tx.auditEvent.create({
      data: {
        action: "PUNCH_RECORDED",
        actorType: "EMPLOYEE",
        actorId: input.employeeId,
        entityType: "Punch",
        entityId: created.id,
        metadata: { type: created.type, source: created.source, deviceLabel: created.deviceLabel, offlineQueued: Boolean(input.offlineQueued) },
      },
    });
    return created;
  }, { isolationLevel: "Serializable" });
}
