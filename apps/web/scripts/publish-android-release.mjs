import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required.`);
  return process.argv[index + 1];
}

function fingerprint(value) {
  const normalized = value.replaceAll(":", "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(normalized)) throw new Error("Invalid release fingerprint.");
  return normalized;
}

const apkPath = path.resolve(argument("apk"));
const manifestPath = path.resolve(argument("manifest"));
const releaseDirectory = process.env.TIMECLOCK_ANDROID_RELEASE_DIR?.trim();
if (!releaseDirectory) throw new Error("TIMECLOCK_ANDROID_RELEASE_DIR is required.");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.packageName !== "com.iancbaer.timeclock") {
  throw new Error("This is not a supported TimeClock release manifest.");
}
if (!Number.isInteger(manifest.versionCode) || manifest.versionCode < 3) throw new Error("Release versionCode must be at least 3.");
if (path.basename(manifest.apkFileName) !== manifest.apkFileName || !manifest.apkFileName.endsWith(".apk")) {
  throw new Error("Unsafe APK file name.");
}
manifest.sha256 = fingerprint(manifest.sha256);
manifest.certificateSha256 = fingerprint(manifest.certificateSha256);
const apk = await readFile(apkPath);
const apkStat = await stat(apkPath);
const actualHash = createHash("sha256").update(apk).digest("hex").toUpperCase();
if (actualHash !== manifest.sha256 || apkStat.size !== manifest.byteSize) throw new Error("APK does not match its verified manifest.");

const root = path.resolve(releaseDirectory);
await mkdir(root, { recursive: true });
const destination = path.resolve(root, manifest.apkFileName);
if (path.dirname(destination) !== root) throw new Error("Release path escapes its directory.");
const temporary = `${destination}.${process.pid}.tmp`;
await copyFile(apkPath, temporary);

const prisma = new PrismaClient();
try {
  const existing = await prisma.kioskRelease.findUnique({ where: { versionCode: manifest.versionCode } });
  if (existing && (existing.sha256 !== manifest.sha256 || existing.certificateSha256 !== manifest.certificateSha256)) {
    throw new Error(`Version code ${manifest.versionCode} is already registered with different contents.`);
  }
  try {
    await rename(temporary, destination);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
    const current = await readFile(destination);
    const currentHash = createHash("sha256").update(current).digest("hex").toUpperCase();
    if (currentHash !== manifest.sha256) throw new Error("Destination APK exists with different contents.");
    await rm(temporary, { force: true });
  }
  const release = await prisma.$transaction(async (tx) => {
    const saved = await tx.kioskRelease.upsert({
      where: { versionCode: manifest.versionCode },
      create: {
        versionCode: manifest.versionCode,
        versionName: manifest.versionName,
        releaseNotes: manifest.releaseNotes,
        apkFileName: manifest.apkFileName,
        sha256: manifest.sha256,
        certificateSha256: manifest.certificateSha256,
        byteSize: manifest.byteSize,
        publishedBy: process.env.TIMECLOCK_RELEASE_ACTOR ?? "release-script",
      },
      update: { active: true },
    });
    await tx.auditEvent.create({
      data: {
        action: "KIOSK_RELEASE_PUBLISHED",
        actorType: "SYSTEM",
        entityType: "KioskRelease",
        entityId: saved.id,
        metadata: { versionCode: saved.versionCode, versionName: saved.versionName, sha256: saved.sha256 },
      },
    });
    return saved;
  });
  console.log(`Published TimeClock ${release.versionName} (${release.versionCode}) to ${destination}.`);
} finally {
  await rm(temporary, { force: true });
  await prisma.$disconnect();
}
