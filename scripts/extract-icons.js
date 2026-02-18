const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT = path.join(__dirname, '..', 'images-design', 'icones.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'icons');
const FAVICON_DIR = path.join(__dirname, '..', 'public', 'icons');

// Ensure output dirs exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(FAVICON_DIR)) fs.mkdirSync(FAVICON_DIR, { recursive: true });

// 1280x720 source image. Generous crops to include full cloud shapes with tails.
const icons = [
  // Row 1 clouds — full shapes including tails (gap to row 2 starts ~y:145)
  { name: 'cloud-1', x: 15,  y: 3,   w: 218, h: 142 },
  { name: 'cloud-2', x: 240, y: 0,   w: 228, h: 140 },
  // Row 2 clouds (gap from row 1 ends ~y:148, gap to row 3 starts ~y:280)
  { name: 'cloud-3', x: 5,   y: 148, w: 175, h: 130 },
  { name: 'cloud-4', x: 210, y: 144, w: 265, h: 134 },
  // Row 3 clouds (gap from row 2 ends ~y:288)
  { name: 'cloud-5', x: 0,   y: 288, w: 235, h: 140 },
  { name: 'cloud-6', x: 245, y: 290, w: 185, h: 132 },

  // Other icons
  { name: 'uzumaki-spiral', x: 475, y: 5,  w: 150, h: 150 },
  { name: 'akatsuki-cloud', x: 640, y: 20, w: 215, h: 130 },
  { name: 'kunai',          x: 485, y: 190, w: 100, h: 310 },
  { name: 'scroll-kunai',   x: 590, y: 165, w: 290, h: 200 },
  { name: 'shuriken',       x: 1030, y: 5,  w: 240, h: 240 },
];

// Favicon sizes for manifest + apple-touch-icon + favicon.ico
const FAVICON_SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512];

async function extract() {
  const meta = await sharp(INPUT).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  // Extract each icon with trim to remove transparent edges
  for (const icon of icons) {
    if (icon.x + icon.w > meta.width || icon.y + icon.h > meta.height) {
      console.error(`OOB: ${icon.name}`);
      continue;
    }
    const outputPath = path.join(OUTPUT_DIR, `${icon.name}.png`);
    try {
      // Extract the region
      let pipeline = sharp(INPUT)
        .extract({ left: icon.x, top: icon.y, width: icon.w, height: icon.h });

      // Try to trim transparent pixels for cleaner edges
      try {
        const trimmed = await pipeline.clone().trim().toBuffer({ resolveWithObject: true });
        // Only use trimmed if it's reasonable (not too small)
        if (trimmed.info.width > 20 && trimmed.info.height > 20) {
          await sharp(trimmed.data).png().toFile(outputPath);
          console.log(`OK: ${icon.name} -> ${trimmed.info.width}x${trimmed.info.height} (trimmed)`);
          continue;
        }
      } catch (trimErr) {
        // Trim failed, fall through to untrimmed
      }

      await pipeline.png().toFile(outputPath);
      const m = await sharp(outputPath).metadata();
      console.log(`OK: ${icon.name} -> ${m.width}x${m.height}`);
    } catch (err) {
      console.error(`Fail: ${icon.name}`, err.message);
    }
  }

  // === Generate favicon from cloud-1 ===
  console.log('\n--- Generating favicon icons from cloud-1 ---');

  // Load cloud-1 and prepare a clean square version
  const cloud1Path = path.join(OUTPUT_DIR, 'cloud-1.png');
  const cloud1Buffer = await sharp(cloud1Path).toBuffer();
  const cloud1Meta = await sharp(cloud1Buffer).metadata();

  // Make it square with padding, centered
  const maxDim = Math.max(cloud1Meta.width, cloud1Meta.height);
  const squareSize = Math.round(maxDim * 1.2); // Add 20% padding

  // Create a square version of the cloud with transparent background
  const squareCloud = await sharp(cloud1Buffer)
    .resize({
      width: Math.round(maxDim * 0.85),
      height: Math.round(maxDim * 0.85),
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  // Composite onto a square transparent canvas
  const masterIcon = await sharp({
    create: {
      width: squareSize,
      height: squareSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: squareCloud,
      gravity: 'centre',
    }])
    .png()
    .toBuffer();

  // Generate each size
  for (const size of FAVICON_SIZES) {
    const outPath = path.join(FAVICON_DIR, `icon-${size}x${size}.png`);
    await sharp(masterIcon)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`Favicon: ${size}x${size}`);
  }

  // Generate apple-touch-icon (180x180 with slight dark bg for visibility on iOS)
  const appleTouchPath = path.join(FAVICON_DIR, 'apple-touch-icon.png');
  await sharp(masterIcon)
    .resize(180, 180, { fit: 'contain', background: { r: 10, g: 10, b: 10, alpha: 255 } })
    .flatten({ background: { r: 10, g: 10, b: 10 } })
    .png()
    .toFile(appleTouchPath);
  console.log('Favicon: apple-touch-icon.png (180x180 with dark bg)');

  // Generate favicon.ico (multi-size ICO using 16, 32, 48 PNGs)
  // Since sharp can't create .ico natively, we'll create individual PNGs
  // and the app will reference them via Next.js metadata

  // Also save a 32x32 as the main favicon.ico replacement
  const favicon32 = path.join(FAVICON_DIR, 'favicon-32x32.png');
  await sharp(masterIcon)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(favicon32);

  // Create a simple .ico file (ICO format: header + 1 PNG entry)
  // ICO file format: 6-byte header + 16-byte directory entry per image + image data
  const icoSizes = [16, 32, 48];
  const icoPngs = [];
  for (const size of icoSizes) {
    const buf = await sharp(masterIcon)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    icoPngs.push({ size, data: buf });
  }

  // Build ICO file
  const icoBuffer = buildIco(icoPngs);
  const icoPath = path.join(FAVICON_DIR, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Favicon: favicon.ico (16+32+48)');

  // Copy favicon.ico to app directory for Next.js
  const appFaviconPath = path.join(__dirname, '..', 'app', 'favicon.ico');
  fs.copyFileSync(icoPath, appFaviconPath);
  console.log('Copied favicon.ico to app/favicon.ico');

  console.log('\nDone!');
}

// Build a valid ICO file from PNG buffers
function buildIco(entries) {
  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  // Then PNG data
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * entries.length;
  let dataOffset = headerSize + dirSize;

  const totalSize = dataOffset + entries.reduce((sum, e) => sum + e.data.length, 0);
  const buffer = Buffer.alloc(totalSize);

  // Header
  buffer.writeUInt16LE(0, 0);               // Reserved
  buffer.writeUInt16LE(1, 2);               // Type: 1 = ICO
  buffer.writeUInt16LE(entries.length, 4);   // Number of images

  // Directory entries
  let offset = headerSize;
  let currentDataOffset = dataOffset;

  for (const entry of entries) {
    buffer.writeUInt8(entry.size >= 256 ? 0 : entry.size, offset);      // Width
    buffer.writeUInt8(entry.size >= 256 ? 0 : entry.size, offset + 1);  // Height
    buffer.writeUInt8(0, offset + 2);        // Color palette
    buffer.writeUInt8(0, offset + 3);        // Reserved
    buffer.writeUInt16LE(1, offset + 4);     // Color planes
    buffer.writeUInt16LE(32, offset + 6);    // Bits per pixel
    buffer.writeUInt32LE(entry.data.length, offset + 8);    // Image data size
    buffer.writeUInt32LE(currentDataOffset, offset + 12);   // Offset to image data

    // Copy PNG data
    entry.data.copy(buffer, currentDataOffset);

    currentDataOffset += entry.data.length;
    offset += dirEntrySize;
  }

  return buffer;
}

extract();
