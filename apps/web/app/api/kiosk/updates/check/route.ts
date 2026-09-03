import { NextResponse } from "next/server";
import { z } from "zod";
import { KioskUpdateState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { selectAssignedUpdate } from "@/lib/kiosk-updates";

const checkSchema = z.object({
  deviceId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  versionCode: z.number().int().positive(),
  versionName: z.string().trim().min(1).max(40),
  updateState: z.nativeEnum(KioskUpdateState).optional(),
  lastUpdateError: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const input = checkSchema.parse(await request.json());
    const existing = await prisma.kioskDevice.findUnique({ where: { id: input.deviceId } });
    if (existing && !existing.active) throw new HttpError(403, "This tablet has been disabled.", "KIOSK_DEVICE_DISABLED");

    const device = await prisma.kioskDevice.upsert({
      where: { id: input.deviceId },
      create: {
        id: input.deviceId,
        label: input.label,
        installedVersionCode: input.versionCode,
        installedVersionName: input.versionName,
        updateState: input.updateState ?? KioskUpdateState.CURRENT,
        lastUpdateError: input.lastUpdateError ?? null,
        lastSeenAt: new Date(),
      },
      update: {
        label: input.label,
        installedVersionCode: input.versionCode,
        installedVersionName: input.versionName,
        updateState: input.updateState,
        lastUpdateError: input.lastUpdateError,
        lastSeenAt: new Date(),
      },
      include: { targetRelease: true },
    });
    const update = selectAssignedUpdate(input.versionCode, device.targetRelease);
    if (update && !input.updateState) {
      await prisma.kioskDevice.update({ where: { id: device.id }, data: { updateState: KioskUpdateState.AVAILABLE } });
    } else if (!update && device.updateState !== KioskUpdateState.CURRENT) {
      await prisma.kioskDevice.update({
        where: { id: device.id },
        data: { updateState: KioskUpdateState.CURRENT, lastUpdateError: null },
      });
    }

    return NextResponse.json({
      serverNow: new Date().toISOString(),
      device: { id: device.id, label: device.label },
      update: update ? {
        id: update.id,
        versionCode: update.versionCode,
        versionName: update.versionName,
        releaseNotes: update.releaseNotes,
        sha256: update.sha256,
        certificateSha256: update.certificateSha256,
        byteSize: update.byteSize,
        downloadPath: `/api/kiosk/updates/${update.id}/apk`,
      } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
