import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const androidRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(androidRoot, "assets", "icon.png");
const resources = path.join(androidRoot, "android", "app", "src", "main", "res");
const densities = {
  mdpi: { legacy: 48, foreground: 108 },
  hdpi: { legacy: 72, foreground: 162 },
  xhdpi: { legacy: 96, foreground: 216 },
  xxhdpi: { legacy: 144, foreground: 324 },
  xxxhdpi: { legacy: 192, foreground: 432 },
};

for (const [density, sizes] of Object.entries(densities)) {
  const directory = path.join(resources, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const legacy = await sharp(source).resize(sizes.legacy, sizes.legacy).png().toBuffer();
  await Promise.all([
    writeFile(path.join(directory, "ic_launcher.png"), legacy),
    writeFile(path.join(directory, "ic_launcher_round.png"), legacy),
  ]);

  const foregroundSize = Math.round(sizes.foreground * 0.72);
  const foreground = await sharp({
    create: { width: sizes.foreground, height: sizes.foreground, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: await sharp(source).resize(foregroundSize, foregroundSize).png().toBuffer(),
    left: Math.floor((sizes.foreground - foregroundSize) / 2),
    top: Math.floor((sizes.foreground - foregroundSize) / 2),
  }]).png().toBuffer();
  await writeFile(path.join(directory, "ic_launcher_foreground.png"), foreground);
}

await writeFile(
  path.join(resources, "values", "ic_launcher_background.xml"),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#102A2E</color>\n</resources>\n',
);

console.log("Generated TimeClock Android launcher icons.");
