import { NextRequest, NextResponse } from 'next/server';
import { getPlayerStats } from '@/lib/topdeck/players';
import { TOPDECK_ATTRIBUTION } from '@/lib/topdeck/serialize';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) return NextResponse.json({ error: 'Missing player key' }, { status: 400 });
  try {
    const stats = await getPlayerStats(decodeURIComponent(key));
    if (!stats) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    return NextResponse.json(
      { player: stats, attribution: TOPDECK_ATTRIBUTION },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } },
    );
  } catch (e) {
    console.error('[topdeck/players/:key] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Failed to load player' }, { status: 500 });
  }
}
