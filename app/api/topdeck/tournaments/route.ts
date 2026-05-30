import { NextRequest, NextResponse } from 'next/server';
import { queryTournaments, type TournamentQuery } from '@/lib/topdeck/cache';
import { serializeTournament, TOPDECK_ATTRIBUTION } from '@/lib/topdeck/serialize';

export const runtime = 'nodejs';

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const asNum = Number(v);
  const d = Number.isFinite(asNum) && v.trim() !== '' ? new Date(asNum > 1e12 ? asNum : asNum * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseIntParam(v: string | null): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sort = sp.get('sort') === 'participants' ? 'participants' : 'startDate';
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc';

  let near: { lat: number; lng: number } | undefined;
  const nearRaw = sp.get('near');
  if (nearRaw) {
    const [latStr, lngStr] = nearRaw.split(',');
    const lat = Number(latStr), lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      near = { lat, lng };
    }
  }

  const query: TournamentQuery = {
    game: sp.get('game') ?? undefined,
    format: sp.get('format') ?? undefined,
    status: sp.get('status') ?? undefined,
    city: sp.get('city') ?? undefined,
    state: sp.get('state') ?? undefined,
    country: sp.get('country') ?? undefined,
    search: sp.get('search') ?? undefined,
    dateFrom: parseDate(sp.get('dateFrom')),
    dateTo: parseDate(sp.get('dateTo')),
    participantsMin: parseIntParam(sp.get('participantsMin')),
    sort,
    order,
    near,
    maxDistanceKm: parseIntParam(sp.get('maxKm')),
    proximityOrder: sp.get('proximityOrder') === 'distance' ? 'distance' : 'date',
    skip: parseIntParam(sp.get('skip')) ?? 0,
    take: parseIntParam(sp.get('take')) ?? 50,
  };

  try {
    const { total, rows, skip, take } = await queryTournaments(query);
    const body = {
      total,
      skip,
      take,
      tournaments: rows.map(serializeTournament),
      attribution: TOPDECK_ATTRIBUTION,
    };
    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    console.error('[topdeck/tournaments] query failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Failed to load tournaments' }, { status: 500 });
  }
}
