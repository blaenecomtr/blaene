import sharp from "sharp";
import { readdir, stat, mkdir } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";

const ROOT = process.cwd();
const QUALITY = 88;
const DIRS = ["KUNYE", "görsel", "logo"];

let converted = 0;
let skipped = 0;
let totalSavedBytes = 0;

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
        const webpPath = fullPath.replace(/\.(png|jpg|jpeg)$/i, ".webp");
        try {
          const existing = await stat(webpPath).catch(() => null);
          if (existing) {
            skipped++;
            continue;
          }
          const origStats = await stat(fullPath);
          await sharp(fullPath)
            .rotate()
            .webp({ quality: QUALITY })
            .toFile(webpPath);
          const newStats = await stat(webpPath);
          const saved = origStats.size - newStats.size;
          totalSavedBytes += saved;
          converted++;
          const pct = ((saved / origStats.size) * 100).toFixed(0);
          console.log(
            `✓ ${fullPath.replace(ROOT + "\\", "")}  ${(origStats.size / 1024).toFixed(0)}KB → ${(newStats.size / 1024).toFixed(0)}KB  (-%${pct})`
          );
        } catch (err) {
          console.error(`✗ ${fullPath}: ${err.message}`);
        }
      }
    }
  }
}

console.log(`WebP dönüşümü başlıyor (quality: ${QUALITY})...\n`);

for (const dir of DIRS) {
  await walk(join(ROOT, dir));
}

console.log(`\n--- Sonuç ---`);
console.log(`Dönüştürülen: ${converted}`);
console.log(`Atlanan (zaten mevcut): ${skipped}`);
console.log(`Toplam tasarruf: ${(totalSavedBytes / 1024 / 1024).toFixed(1)} MB`);
