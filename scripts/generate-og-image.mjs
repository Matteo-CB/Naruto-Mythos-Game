/**
 * Generate OG image (1200x630) for the Naruto Mythos TCG site.
 *
 * Uses sharp to:
 *  1. Create a dark background (#0a0a0a)
 *  2. Composite the Naruto rare card on the right side
 *  3. Add a gold-tinted overlay strip on the left
 *  4. Overlay SVG text with title and subtitle
 *  5. Save as public/images/og-image.webp
 */

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const WIDTH = 1200;
const HEIGHT = 630;

const CARD_IMAGE = path.join(
  ROOT,
  "public/images/rare/108-130_NARUTO_UZUMAKI.webp"
);
const OUTPUT = path.join(ROOT, "public/images/og-image.webp");

async function main() {
  // 1. Resize the Naruto card to fit the right portion
  // Card is 1606x2197. Scale to fit HEIGHT and position on right.
  const cardHeight = HEIGHT; // fill full height
  const cardWidth = Math.round((1606 / 2197) * cardHeight); // ~462px

  const cardResized = await sharp(CARD_IMAGE)
    .resize({ height: cardHeight, width: cardWidth, fit: "cover" })
    .toBuffer();

  // 2. Gold-tinted overlay strip on the left
  const goldStrip = Buffer.from(
    `<svg width="460" height="${HEIGHT}">
      <rect x="0" y="0" width="460" height="${HEIGHT}" fill="#c4a35a" opacity="0.10"/>
      <rect x="456" y="0" width="4" height="${HEIGHT}" fill="#c4a35a" opacity="0.35"/>
    </svg>`
  );

  // 3. SVG text overlay
  const svgText = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <style>
        .title {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 72px;
          font-weight: 900;
          letter-spacing: 4px;
          fill: #c4a35a;
        }
        .subtitle {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 30px;
          font-weight: 400;
          letter-spacing: 6px;
          fill: #888888;
        }
        .tagline {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 18px;
          font-weight: 300;
          letter-spacing: 2px;
          fill: #666666;
        }
      </style>
      <text x="60" y="250" class="title">NARUTO</text>
      <text x="60" y="330" class="title">MYTHOS</text>
      <text x="64" y="380" class="subtitle">Trading Card Game</text>
      <text x="64" y="430" class="tagline">PLAY ONLINE  |  COLLECT  |  COMPETE</text>
    </svg>`
  );

  // 4. Composite everything onto the dark background
  const result = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 1 },
    },
  })
    .composite([
      // Card image on the right side
      {
        input: cardResized,
        left: WIDTH - cardWidth,
        top: 0,
        blend: "over",
      },
      // Fade the card into the background with a gradient overlay
      {
        input: Buffer.from(
          `<svg width="${cardWidth + 80}" height="${HEIGHT}">
            <defs>
              <linearGradient id="fade" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0a0a0a" stop-opacity="1"/>
                <stop offset="60%" stop-color="#0a0a0a" stop-opacity="0.6"/>
                <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <rect width="${cardWidth + 80}" height="${HEIGHT}" fill="url(#fade)"/>
          </svg>`
        ),
        left: WIDTH - cardWidth - 80,
        top: 0,
        blend: "over",
      },
      // Gold strip on the left
      {
        input: goldStrip,
        left: 0,
        top: 0,
        blend: "over",
      },
      // Text overlay
      {
        input: svgText,
        left: 0,
        top: 0,
        blend: "over",
      },
      // Bottom border accent line
      {
        input: Buffer.from(
          `<svg width="${WIDTH}" height="4">
            <rect width="${WIDTH}" height="4" fill="#c4a35a" opacity="0.5"/>
          </svg>`
        ),
        left: 0,
        top: HEIGHT - 4,
        blend: "over",
      },
    ])
    .webp({ quality: 90 })
    .toFile(OUTPUT);

  console.log(`OG image generated successfully: ${OUTPUT}`);
  console.log(`  Size: ${WIDTH}x${HEIGHT}`);
  console.log(`  Format: webp`);
  console.log(`  File size: ${result.size} bytes`);
}

main().catch((err) => {
  console.error("Failed to generate OG image:", err);
  process.exit(1);
});
