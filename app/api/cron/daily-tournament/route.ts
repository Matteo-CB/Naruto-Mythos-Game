import { NextRequest, NextResponse } from 'next/server';
import { createDailyTournamentIfNeeded } from '@/lib/tournament/dailyTournament';
import { createNwlFridayTournamentIfNeeded, resetNwlChuninIfMonday } from '@/lib/tournament/nwlFridayTournament';
import { retryPendingNwlPrizes } from '@/lib/tournament/nwlPrize';
import {
  createNwlChuninTournamentIfNeeded,
  createNwlKageTournamentIfNeeded,
  diffuserCodeChunin,
  diffuserCodeKage,
  annoncerOuvertureGenin,
  publierClassementChunin,
  synchroniserRoleKage,
  NWL_HEURE_SYNCHRO_KAGE,
} from '@/lib/tournament/nwlTiers';
import { parisDateParts } from '@/lib/tournament/dailyTournament';

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

    if (nwl.created) {
      const annonce = await annoncerOuvertureGenin();
      console.log(`[Cron] Genin tournament announced on Discord: ${annonce}`);
    }

    const chunin = await createNwlChuninTournamentIfNeeded();
    if (chunin.created && chunin.joinCode) {
      const diffusion = await diffuserCodeChunin(chunin.joinCode);
      console.log(`[Cron] Chunin tournament created, code sent to ${diffusion.mp} player(s), channel: ${diffusion.salon}`);
    }

    const kage = await createNwlKageTournamentIfNeeded();
    if (kage.created && kage.joinCode) {
      const diffusion = await diffuserCodeKage(kage.joinCode);
      console.log(`[Cron] Kage tournament created, code sent to ${diffusion.mp} player(s), channel: ${diffusion.salon}`);
    }

    let classement: { publie: boolean; joueurs: number } | null = null;
    let roleKage: { ajoutes: number; retires: number } | null = null;
    if (parisDateParts(new Date()).hour === NWL_HEURE_SYNCHRO_KAGE) {
      classement = await publierClassementChunin();
      roleKage = await synchroniserRoleKage();
      console.log(`[Cron] Chunin standings published: ${classement.publie}, Kage role sync: ${JSON.stringify(roleKage)}`);
    }

    return NextResponse.json({ daily, nwl, nwlPrizeRetry, chuninReset, chunin, kage, classement, roleKage });
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
