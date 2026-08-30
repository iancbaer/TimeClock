import type { Punch, PunchRevision } from "@prisma/client";
import type { EffectivePunch } from "@nanshe/core";
import { DateTime } from "luxon";
import { prisma } from "./db";

type PunchWithRevisions = Punch & { revisions: PunchRevision[] };

export function toEffectivePunch(punch: PunchWithRevisions): EffectivePunch | null {
  const revision = punch.revisions[0];
  if (revision?.voided) return null;
  return {
    id: punch.id,
    type: revision?.effectiveType ?? punch.type,
    occurredAt: revision?.effectiveOccurredAt ?? punch.occurredAt,
    originalType: punch.type,
    originalOccurredAt: punch.occurredAt,
    source: punch.source,
    revised: Boolean(revision),
  };
}

export async function effectivePunchesForEmployee(
  employeeId: string,
  from: Date,
  to: Date,
): Promise<EffectivePunch[]> {
  const punches = await prisma.punch.findMany({
    where: { employeeId, occurredAt: { gte: from, lt: to } },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { occurredAt: "asc" },
  });
  return punches.map(toEffectivePunch).filter((punch): punch is EffectivePunch => punch !== null);
}

export async function effectiveRecentPunches(employeeId: string, timeZone: string): Promise<EffectivePunch[]> {
  const now = DateTime.now().setZone(timeZone);
  return effectivePunchesForEmployee(
    employeeId,
    now.minus({ days: 7 }).toUTC().toJSDate(),
    now.plus({ days: 1 }).toUTC().toJSDate(),
  );
}
