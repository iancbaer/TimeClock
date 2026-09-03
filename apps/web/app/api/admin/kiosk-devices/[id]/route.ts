import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";

const assignmentSchema = z.object({ targetReleaseId: z.string().min(1).nullable() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }, input] = await Promise.all([
      requireAdmin(),
      context.params,
      request.json().then((body) => assignmentSchema.parse(body)),
    ]);
    const existing = await prisma.kioskDevice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Tablet not found.", "KIOSK_DEVICE_NOT_FOUND");
    const release = input.targetReleaseId
      ? await prisma.kioskRelease.findFirst({ where: { id: input.targetReleaseId, active: true } })
      : null;
    if (input.targetReleaseId && !release) throw new HttpError(404, "Release not found.", "KIOSK_RELEASE_NOT_FOUND");

    const device = await prisma.$transaction(async (tx) => {
      const updated = await tx.kioskDevice.update({
        where: { id },
        data: {
          targetReleaseId: release?.id ?? null,
          updateState: release && release.versionCode > existing.installedVersionCode ? "AVAILABLE" : "CURRENT",
          lastUpdateError: null,
        },
        include: { targetRelease: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "KIOSK_UPDATE_ASSIGNED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "KioskDevice",
          entityId: id,
          metadata: {
            label: existing.label,
            previousReleaseId: existing.targetReleaseId,
            targetReleaseId: release?.id ?? null,
            targetVersionCode: release?.versionCode ?? null,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ device });
  } catch (error) {
    return errorResponse(error);
  }
}
