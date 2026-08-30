import type { Punch, PunchRevision } from "@prisma/client";
import type { EffectivePunch } from "@timeclock/core";
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
    where: {
      employeeId,
      OR: [
        { occurredAt: { gte: from, lt: to } },
        { revisions: { some: { effectiveOccurredAt: { gte: from, lt: to } } } },
      ],
    },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { occurredAt: "asc" },
  });
  const fromTime = from.getTime();
  const toTime = to.getTime();
  return punches
    .map(toEffectivePunch)
    .filter((punch): punch is EffectivePunch => {
      if (!punch) return false;
      const occurredAt = new Date(punch.occurredAt).getTime();
      return occurredAt >= fromTime && occurredAt < toTime;
    })
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
}

export async function effectiveRecentPunches(employeeId: string, timeZone: string): Promise<EffectivePunch[]> {
  const now = DateTime.now().setZone(timeZone);
  return effectivePunchesForEmployee(
    employeeId,
    now.minus({ days: 7 }).toUTC().toJSDate(),
    now.plus({ days: 1 }).toUTC().toJSDate(),
  );
}
