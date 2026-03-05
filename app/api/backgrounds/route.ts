import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/backgrounds
 * Dynamically lists all .webp files in public/images/backgrounds/.
 * To add a new background, just drop a .webp file in that folder.
 */
export async function GET() {
  try {
    const bgDir = path.join(process.cwd(), 'public', 'images', 'backgrounds');

    if (!fs.existsSync(bgDir)) {
      return NextResponse.json({ backgrounds: [] });
    }

    const files = fs.readdirSync(bgDir)
      .filter((f) => f.endsWith('.webp'))
      .sort();

    const backgrounds = files.map((filename) => ({
      id: filename.replace('.webp', ''),
      filename,
      url: `/images/backgrounds/${filename}`,
    }));

    return NextResponse.json({ backgrounds });
  } catch {
    return NextResponse.json({ backgrounds: [] });
  }
}
