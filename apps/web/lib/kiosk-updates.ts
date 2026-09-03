import path from "node:path";

export interface UpdateReleaseCandidate {
  id: string;
  versionCode: number;
  versionName: string;
  releaseNotes: string;
  sha256: string;
  certificateSha256: string;
  byteSize: number;
  active: boolean;
}

export function normalizedSha256(value: string): string {
  const normalized = value.replaceAll(":", "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(normalized)) throw new Error("Expected a SHA-256 fingerprint.");
  return normalized;
}

export function selectAssignedUpdate(
  installedVersionCode: number,
  release: UpdateReleaseCandidate | null,
): UpdateReleaseCandidate | null {
  if (!release?.active || release.versionCode <= installedVersionCode) return null;
  return release;
}

export function androidReleaseDirectory(): string {
  const configured = process.env.TIMECLOCK_ANDROID_RELEASE_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (process.env.NODE_ENV === "production") {
    throw new Error("TIMECLOCK_ANDROID_RELEASE_DIR is required in production.");
  }
  return path.resolve(process.cwd(), ".timeclock-android-releases");
}

export function safeReleasePath(directory: string, fileName: string): string {
  if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9._-]+\.apk$/.test(fileName)) {
    throw new Error("Unsafe Android release file name.");
  }
  const root = path.resolve(directory);
  const candidate = path.resolve(root, fileName);
  if (path.dirname(candidate) !== root) throw new Error("Android release path escapes its directory.");
  return candidate;
}
