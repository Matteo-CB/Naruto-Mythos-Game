import { NextRequest, NextResponse } from 'next/server';
import { ensureTournamentDetail } from '@/lib/topdeck/poller';
import { serializeTournament, TOPDECK_ATTRIBUTION } from '@/lib/topdeck/serialize';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tid: string }> },
) {
  const { tid } = await params;
  if (!tid) return NextResponse.json({ error: 'Missing tournament id' }, { status: 400 });

  try {
    const row = await ensureTournamentDetail(tid);
    if (!row) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    return NextResponse.json(
      { tournament: serializeTournament(row), attribution: TOPDECK_ATTRIBUTION },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } },
    );
  } catch (e) {
    console.error('[topdeck/tournaments/:tid] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Failed to load tournament' }, { status: 500 });
  }
}
