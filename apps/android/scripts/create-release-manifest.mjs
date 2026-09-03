import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function newestBuildTool(toolName) {
  const root = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!root) return toolName;
  const versions = await readdir(path.join(root, "build-tools"));
  versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  const extension = process.platform === "win32" ? ".bat" : "";
  return path.join(root, "build-tools", versions[0], `${toolName}${extension}`);
}

const apkPath = path.resolve(argument("apk", "android/app/build/outputs/apk/release/app-release.apk"));
const outputPath = path.resolve(argument("output", "android/app/build/outputs/apk/release/release-manifest.json"));
const expectedPackage = "com.iancbaer.timeclock";
const apksigner = await newestBuildTool("apksigner");
const aapt = await newestBuildTool("aapt");

const signatureOutput = execFileSync(apksigner, ["verify", "--verbose", "--print-certs", apkPath], { encoding: "utf8" });
const certificateSha256 = signatureOutput.match(/certificate SHA-256 digest:\s*([A-Fa-f0-9]+)/)?.[1]?.toUpperCase();
if (!certificateSha256) throw new Error("Could not read the APK signing certificate fingerprint.");

const badging = execFileSync(aapt, ["dump", "badging", apkPath], { encoding: "utf8" });
const packageMatch = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
if (!packageMatch) throw new Error("Could not read APK package/version metadata.");
const [, packageName, rawVersionCode, versionName] = packageMatch;
if (packageName !== expectedPackage) throw new Error(`Unexpected package name ${packageName}.`);

const contents = await readFile(apkPath);
const metadata = await stat(apkPath);
const versionCode = Number(rawVersionCode);
const releaseNotes = argument("notes", process.env.ANDROID_RELEASE_NOTES ?? `TimeClock ${versionName}`);
const manifest = {
  schemaVersion: 1,
  packageName,
  versionCode,
  versionName,
  releaseNotes,
  apkFileName: `timeclock-${versionCode}.apk`,
  sha256: createHash("sha256").update(contents).digest("hex").toUpperCase(),
  certificateSha256,
  byteSize: metadata.size,
  createdAt: new Date().toISOString(),
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Verified ${packageName} ${versionName} (${versionCode}) and wrote ${outputPath}.`);
