import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";

const schema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }, input] = await Promise.all([
      requireAdmin(),
      context.params,
      request.json().then((body) => schema.parse(body)),
    ]);
    if (id === admin.id && !input.active) throw new HttpError(409, "You cannot disable the manager account currently in use.");
    const user = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext('timeclock-manager-accounts'))) SELECT 1::int AS "locked" FROM acquired`;
      const target = await tx.adminUser.findUnique({ where: { id }, select: { id: true, active: true } });
      if (!target) throw new HttpError(404, "Manager account not found.");
      if (!input.active && target.active) {
        const activeCount = await tx.adminUser.count({ where: { active: true } });
        if (activeCount <= 1) throw new HttpError(409, "TimeClock must retain at least one active manager account.");
      }
      const updated = await tx.adminUser.update({
        where: { id },
        data: { active: input.active },
        select: { id: true, name: true, email: true, active: true, mustChangePassword: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          action: input.active ? "ADMIN_USER_ENABLED" : "ADMIN_USER_DISABLED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "AdminUser",
          entityId: id,
          metadata: {},
        },
      });
      return updated;
    });
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
