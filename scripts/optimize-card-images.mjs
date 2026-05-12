import sharp from 'sharp';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'public/images/cards/KS';
const MAX_W = 800;
const MAX_H = 1100;
const QUALITY = 78;
const EFFORT = 4;

const dryRun = process.argv.includes('--dry');
const single = process.argv.find(a => a.startsWith('--only='));
const onlyFile = single ? single.slice('--only='.length) : null;

const dirs = readdirSync(ROOT).filter(d => statSync(join(ROOT, d)).isDirectory());

let totalBefore = 0;
let totalAfter = 0;
let processed = 0;
let skipped = 0;

async function processFile(fullPath, relName) {
  const buf = readFileSync(fullPath);
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return;
  if (meta.width <= MAX_W && meta.height <= MAX_H) {
    skipped++;
    return;
  }
  totalBefore += buf.length;
  if (dryRun) {
    console.log(`would resize ${relName}  ${meta.width}x${meta.height}  ${Math.round(buf.length / 1024)}KB`);
    return;
  }
  const out = await sharp(buf)
    .resize({ width: MAX_W, height: MAX_H, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: EFFORT })
    .toBuffer();
  totalAfter += out.length;
  if (out.length >= buf.length) {
    skipped++;
    return;
  }
  const { writeFileSync } = await import('fs');
  writeFileSync(fullPath, out);
  processed++;
  const pct = Math.round((1 - out.length / buf.length) * 100);
  console.log(`${relName.padEnd(38)}  ${Math.round(buf.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB  (-${pct}%)`);
}

for (const d of dirs) {
  const dirPath = join(ROOT, d);
  for (const f of readdirSync(dirPath)) {
    if (!f.endsWith('.webp')) continue;
    const rel = `${d}/${f}`;
    if (onlyFile && !rel.endsWith(onlyFile)) continue;
    const full = join(dirPath, f);
    await processFile(full, rel);
  }
}

console.log('---');
console.log(`processed: ${processed}  skipped (already small or no gain): ${skipped}`);
if (!dryRun && processed > 0) {
  console.log(`before: ${Math.round(totalBefore / 1024 / 1024 * 10) / 10} MB`);
  console.log(`after:  ${Math.round(totalAfter / 1024 / 1024 * 10) / 10} MB`);
  console.log(`saved:  ${Math.round((totalBefore - totalAfter) / 1024 / 1024 * 10) / 10} MB  (${Math.round((1 - totalAfter / totalBefore) * 100)}%)`);
}
