import { NextRequest, NextResponse } from 'next/server';
import { searchPlayers } from '@/lib/topdeck/players';
import { TOPDECK_ATTRIBUTION } from '@/lib/topdeck/serialize';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  try {
    const players = q.trim().length >= 2 ? await searchPlayers(q) : [];
    return NextResponse.json(
      { players, attribution: TOPDECK_ATTRIBUTION },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (e) {
    console.error('[topdeck/players] search failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Failed to search players' }, { status: 500 });
  }
}
