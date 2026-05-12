import { NextResponse } from 'next/server';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const BG_DIR = join(process.cwd(), 'public/images/backgrounds');

interface Background {
  id: string;
  name: string;
  url: string;
}

let cached: { backgrounds: Background[]; at: number } | null = null;
const CACHE_MS = 60_000;

function listBackgrounds(): Background[] {
  if (!existsSync(BG_DIR)) return [];
  const files = readdirSync(BG_DIR)
    .filter((f) => /^\d+\.(webp|jpg|jpeg|png|avif)$/i.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return files.map((f) => {
    const id = f.split('.')[0];
    return {
      id,
      name: `Fond ${id}`,
      url: `/images/backgrounds/${f}`,
    };
  });
}

export async function GET() {
  try {
    const now = Date.now();
    if (!cached || now - cached.at > CACHE_MS) {
      cached = { backgrounds: listBackgrounds(), at: now };
    }
    const response = NextResponse.json({ backgrounds: cached.backgrounds });
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return response;
  } catch {
    return NextResponse.json({ backgrounds: [] });
  }
}
