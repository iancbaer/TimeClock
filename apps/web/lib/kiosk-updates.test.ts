import { describe, expect, it } from "vitest";
import { normalizedSha256, safeReleasePath, selectAssignedUpdate } from "./kiosk-updates";

const release = {
  id: "release-1",
  versionCode: 4,
  versionName: "1.3.0",
  releaseNotes: "Tablet update",
  sha256: "A".repeat(64),
  certificateSha256: "B".repeat(64),
  byteSize: 4_200_000,
  active: true,
};

describe("kiosk update selection", () => {
  it("returns only a newer active assigned release", () => {
    expect(selectAssignedUpdate(3, release)).toEqual(release);
    expect(selectAssignedUpdate(4, release)).toBeNull();
    expect(selectAssignedUpdate(5, release)).toBeNull();
    expect(selectAssignedUpdate(3, { ...release, active: false })).toBeNull();
    expect(selectAssignedUpdate(3, null)).toBeNull();
  });

  it("normalizes colon-separated fingerprints", () => {
    expect(normalizedSha256(Array(32).fill("ab").join(":"))).toBe("AB".repeat(32));
    expect(() => normalizedSha256("not-a-hash")).toThrow();
  });

  it("keeps APK paths inside the configured directory", () => {
    expect(safeReleasePath("C:/releases", "timeclock-3.apk")).toMatch(/timeclock-3\.apk$/);
    expect(() => safeReleasePath("C:/releases", "../secret.apk")).toThrow();
    expect(() => safeReleasePath("C:/releases", "notes.txt")).toThrow();
  });
});
