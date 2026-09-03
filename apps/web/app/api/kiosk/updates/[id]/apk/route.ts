import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { androidReleaseDirectory, safeReleasePath } from "@/lib/kiosk-updates";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const deviceId = request.headers.get("x-timeclock-device-id")?.trim();
    if (!deviceId) throw new HttpError(401, "Tablet identity is required.", "KIOSK_DEVICE_REQUIRED");
    const { id } = await context.params;
    const device = await prisma.kioskDevice.findFirst({
      where: { id: deviceId, active: true, targetReleaseId: id },
      include: { targetRelease: true },
    });
    const release = device?.targetRelease;
    if (!release?.active) throw new HttpError(404, "That tablet update is not available.", "KIOSK_UPDATE_NOT_FOUND");

    const apkPath = safeReleasePath(androidReleaseDirectory(), release.apkFileName);
    const file = await stat(apkPath);
    if (!file.isFile() || file.size !== release.byteSize) {
      throw new HttpError(503, "The tablet update is not ready for download.", "KIOSK_UPDATE_UNAVAILABLE");
    }
    const stream = Readable.toWeb(createReadStream(apkPath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${release.apkFileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
