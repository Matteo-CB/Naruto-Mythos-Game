import { NextRequest, NextResponse } from 'next/server';
import { createDailyTournamentIfNeeded } from '@/lib/tournament/dailyTournament';
import { createNwlFridayTournamentIfNeeded, resetNwlChuninIfMonday } from '@/lib/tournament/nwlFridayTournament';
import { retryPendingNwlPrizes } from '@/lib/tournament/nwlPrize';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [daily, nwl, nwlPrizeRetry] = await Promise.all([
      createDailyTournamentIfNeeded(),
      createNwlFridayTournamentIfNeeded(),
      retryPendingNwlPrizes(new Date()),
    ]);
    const chuninReset = await resetNwlChuninIfMonday(new Date());
    return NextResponse.json({ daily, nwl, nwlPrizeRetry, chuninReset });
  } catch (err) {
    console.error('[Cron] daily-tournament error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
