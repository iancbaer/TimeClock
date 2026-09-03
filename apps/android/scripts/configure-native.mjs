import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const androidRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../android");
const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../native");
const javaRoot = path.join(androidRoot, "app/src/main/java/com/iancbaer/timeclock");
await mkdir(javaRoot, { recursive: true });
await copyFile(path.join(nativeRoot, "MainActivity.java"), path.join(javaRoot, "MainActivity.java"));
await copyFile(path.join(nativeRoot, "AppUpdatePlugin.java"), path.join(javaRoot, "AppUpdatePlugin.java"));

const buildFile = path.join(androidRoot, "app/build.gradle");
const applyLine = "apply from: '../../native/timeclock-release.gradle'";
const buildContents = await readFile(buildFile, "utf8");
if (!buildContents.includes(applyLine)) await appendFile(buildFile, `\n${applyLine}\n`, "utf8");

const manifestFile = path.join(androidRoot, "app/src/main/AndroidManifest.xml");
let manifest = await readFile(manifestFile, "utf8");
const installPermission = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace("<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">", `<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n\n    ${installPermission}`);
  await writeFile(manifestFile, manifest, "utf8");
}

console.log("Applied the TimeClock Android native updater and release configuration.");
