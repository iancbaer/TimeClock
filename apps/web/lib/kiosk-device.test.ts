import { afterEach, describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { requireKioskDevice } from "./kiosk-device";

const key = "a-device-key-that-is-at-least-32-characters";

function requestWith(deviceKey?: string): Request {
  return new Request("http://localhost/api/kiosk/offline-roster", {
    headers: deviceKey ? { "x-timeclock-device-key": deviceKey } : {},
  });
}

function statusOf(run: () => void): number | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
}

describe("kiosk device authorization", () => {
  afterEach(() => { delete process.env.KIOSK_DEVICE_KEY; });

  it("stays closed when no device key is configured", () => {
    delete process.env.KIOSK_DEVICE_KEY;
    expect(statusOf(() => requireKioskDevice(requestWith(key)))).toBe(503);
  });

  it("stays closed when the configured key is too short to be a secret", () => {
    process.env.KIOSK_DEVICE_KEY = "short";
    expect(statusOf(() => requireKioskDevice(requestWith("short")))).toBe(503);
  });

  it("rejects a missing or wrong key", () => {
    process.env.KIOSK_DEVICE_KEY = key;
    expect(statusOf(() => requireKioskDevice(requestWith()))).toBe(401);
    expect(statusOf(() => requireKioskDevice(requestWith(`${key}x`)))).toBe(401);
    expect(statusOf(() => requireKioskDevice(requestWith(key.slice(0, -1))))).toBe(401);
  });

  it("accepts the configured key", () => {
    process.env.KIOSK_DEVICE_KEY = key;
    expect(statusOf(() => requireKioskDevice(requestWith(key)))).toBeNull();
  });
});
