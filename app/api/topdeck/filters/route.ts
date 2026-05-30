import { NextRequest, NextResponse } from 'next/server';
import { getFilterFacets, type TournamentQuery } from '@/lib/topdeck/cache';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const base: TournamentQuery = {
    game: sp.get('game') ?? undefined,
    format: sp.get('format') ?? undefined,
    status: sp.get('status') ?? undefined,
    country: sp.get('country') ?? undefined,
  };
  try {
    const facets = await getFilterFacets(base);
    return NextResponse.json(facets, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('[topdeck/filters] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Failed to load filters' }, { status: 500 });
  }
}
