import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";

const MINIMUM_KEY_LENGTH = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Endpoints that hand out credentials for every employee must not depend on a
// proxy in front of the service to keep strangers out. Without a configured
// key they stay closed.
export function requireKioskDevice(request: Request): void {
  const configured = process.env.KIOSK_DEVICE_KEY?.trim() ?? "";
  if (configured.length < MINIMUM_KEY_LENGTH) {
    throw new HttpError(
      503,
      "Offline tablet support is not configured on this server.",
      "KIOSK_DEVICE_KEY_NOT_CONFIGURED",
    );
  }
  const provided = request.headers.get("x-timeclock-device-key")?.trim() ?? "";
  if (!provided || !timingSafeEqual(digest(provided), digest(configured))) {
    throw new HttpError(401, "This device is not authorized for offline use.", "KIOSK_DEVICE_UNAUTHORIZED");
  }
}
