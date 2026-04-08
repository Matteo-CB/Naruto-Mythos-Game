/**
 * Generate Discord tournament banner (800x320) for Naruto Mythos TCG.
 *
 * Two-pass approach:
 * 1. Generate background (cards + fades + overlays) with sharp
 * 2. Use Python/Pillow to draw text with NJNaruto font on top
 *
 * Run: node scripts/generate-tournament-banner.mjs
 */

import sharp from "sharp";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const WIDTH = 800;
const HEIGHT = 320;

const CARD_LEFT = path.join(ROOT, "public/images/cards/KS/rare/KS-123-R.webp");
const CARD_RIGHT = path.join(ROOT, "public/images/cards/KS/mythos/KS-146-M.webp");
const TEMP_BG = path.join(ROOT, "public/images/_tournament-bg-temp.png");
const OUTPUT = path.join(ROOT, "public/images/tournament-banner.webp");
const FONT_NJ = path.join(ROOT, "public/fonts/njnaruto-accented.ttf");

async function main() {
  const cardH = HEIGHT;
  const cardW = Math.round((63 / 88) * cardH);

  const [cardLeft, cardRight] = await Promise.all([
    sharp(CARD_LEFT).resize({ height: cardH, width: cardW, fit: "cover" }).toBuffer(),
    sharp(CARD_RIGHT).resize({ height: cardH, width: cardW, fit: "cover" }).toBuffer(),
  ]);

  // Fade overlays — push cards further to edges, bigger fade zone
  const fadeLeft = Buffer.from(
    `<svg width="${cardW + 100}" height="${HEIGHT}">
      <defs><linearGradient id="fl" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0"/>
        <stop offset="50%" stop-color="#0a0a0a" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#0a0a0a" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${cardW + 100}" height="${HEIGHT}" fill="url(#fl)"/>
    </svg>`
  );

  const fadeRight = Buffer.from(
    `<svg width="${cardW + 100}" height="${HEIGHT}">
      <defs><linearGradient id="fr" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0a0a0a" stop-opacity="1"/>
        <stop offset="50%" stop-color="#0a0a0a" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0"/>
      </linearGradient></defs>
      <rect width="${cardW + 100}" height="${HEIGHT}" fill="url(#fr)"/>
    </svg>`
  );

  // Heavy vignette
  const vignette = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs><radialGradient id="vig" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0.75"/>
      </radialGradient></defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vig)"/>
    </svg>`
  );

  // Accent lines
  const topLine = Buffer.from(
    `<svg width="${WIDTH}" height="2"><rect width="${WIDTH}" height="2" fill="#c4a35a" opacity="0.5"/></svg>`
  );
  const bottomLine = Buffer.from(
    `<svg width="${WIDTH}" height="2"><rect width="${WIDTH}" height="2" fill="#c4a35a" opacity="0.5"/></svg>`
  );

  // Subtle gold glow in center
  const centerGlow = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs><radialGradient id="glow" cx="50%" cy="45%" r="30%">
        <stop offset="0%" stop-color="#c4a35a" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#c4a35a" stop-opacity="0"/>
      </radialGradient></defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
    </svg>`
  );

  // Step 1: Generate background without text
  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 1 },
    },
  })
    .composite([
      { input: cardLeft, left: -60, top: 0, blend: "over" },
      { input: cardRight, left: WIDTH - cardW + 60, top: 0, blend: "over" },
      { input: fadeLeft, left: -60, top: 0, blend: "over" },
      { input: fadeRight, left: WIDTH - cardW - 40, top: 0, blend: "over" },
      { input: vignette, left: 0, top: 0, blend: "over" },
      { input: centerGlow, left: 0, top: 0, blend: "over" },
      { input: topLine, left: 0, top: 0, blend: "over" },
      { input: bottomLine, left: 0, top: HEIGHT - 2, blend: "over" },
    ])
    .png()
    .toFile(TEMP_BG);

  // Step 2: Use Python/Pillow to draw text with actual NJNaruto font
  const pyScript = `
import sys
from PIL import Image, ImageDraw, ImageFont

img = Image.open(r'${TEMP_BG.replace(/\\/g, "\\\\")}')
draw = ImageDraw.Draw(img)

try:
    font_nj = ImageFont.truetype(r'${FONT_NJ.replace(/\\/g, "\\\\")}', 56)
except:
    font_nj = ImageFont.load_default()

try:
    font_sub = ImageFont.truetype("arial.ttf", 15)
    font_tag = ImageFont.truetype("arial.ttf", 11)
except:
    font_sub = ImageFont.load_default()
    font_tag = ImageFont.load_default()

W, H = img.size

# Title: TOURNAMENT in NJNaruto
title = "TOURNAMENT"
bbox = draw.textbbox((0, 0), title, font=font_nj)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, 105), title, fill=(196, 163, 90), font=font_nj)

# Thin gold separator line
line_w = 200
draw.line([(W // 2 - line_w // 2, 175), (W // 2 + line_w // 2, 175)], fill=(196, 163, 90, 80), width=1)

# Subtitle: NARUTO MYTHOS TCG in system font
sub = "NARUTO MYTHOS TCG"
bbox2 = draw.textbbox((0, 0), sub, font=font_sub)
sw = bbox2[2] - bbox2[0]
draw.text(((W - sw) // 2, 185), sub, fill=(153, 153, 153), font=font_sub)

# Tagline
tag = "Swiss Rounds  |  Single Elimination  |  Limited Slots"
bbox3 = draw.textbbox((0, 0), tag, font=font_tag)
tagw = bbox3[2] - bbox3[0]
draw.text(((W - tagw) // 2, 215), tag, fill=(102, 102, 102), font=font_tag)

img.save(r'${OUTPUT.replace(/\\/g, "\\\\")}', 'WEBP', quality=92)
print("OK")
`;

  try {
    const result = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, { encoding: "utf-8" });
    if (result.trim() === "OK") {
      // Clean up temp
      const fs = await import("fs");
      fs.unlinkSync(TEMP_BG);
      const stats = fs.statSync(OUTPUT);
      console.log(`Tournament banner generated: ${OUTPUT}`);
      console.log(`  Size: ${WIDTH}x${HEIGHT}, ${stats.size} bytes`);
    }
  } catch (err) {
    console.error("Python text rendering failed, falling back to SVG text");
    // Fallback: just use the background as-is with SVG text
    const svgText = Buffer.from(
      `<svg width="${WIDTH}" height="${HEIGHT}">
        <text x="${WIDTH/2}" y="145" text-anchor="middle" font-family="Arial" font-size="48" font-weight="900" letter-spacing="8" fill="#c4a35a">TOURNAMENT</text>
        <line x1="${WIDTH/2-100}" y1="170" x2="${WIDTH/2+100}" y2="170" stroke="#c4a35a" stroke-opacity="0.3" stroke-width="1"/>
        <text x="${WIDTH/2}" y="195" text-anchor="middle" font-family="Arial" font-size="14" letter-spacing="4" fill="#999">NARUTO MYTHOS TCG</text>
        <text x="${WIDTH/2}" y="220" text-anchor="middle" font-family="Arial" font-size="11" letter-spacing="2" fill="#666">Swiss Rounds  |  Single Elimination  |  Limited Slots</text>
      </svg>`
    );
    await sharp(TEMP_BG)
      .composite([{ input: svgText, left: 0, top: 0, blend: "over" }])
      .webp({ quality: 92 })
      .toFile(OUTPUT);
    const fs = await import("fs");
    fs.unlinkSync(TEMP_BG);
    console.log(`Tournament banner generated (fallback): ${OUTPUT}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
