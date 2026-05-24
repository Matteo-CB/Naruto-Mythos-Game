import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { getPlayableMissions } from '@/lib/data/cardLoader';
import { getSocketIO } from '@/lib/socket/server';

const MIN_DECK_SIZE = 30;
const REQUIRED_MISSIONS = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', errorKey: 'tournament.error.unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const cardIds = Array.isArray(body?.cardIds) ? body.cardIds.filter((x: unknown): x is string => typeof x === 'string') : [];
    const missionIds = Array.isArray(body?.missionIds) ? body.missionIds.filter((x: unknown): x is string => typeof x === 'string') : [];

    if (cardIds.length < MIN_DECK_SIZE || missionIds.length !== REQUIRED_MISSIONS) {
      return NextResponse.json({ error: 'Invalid deck size', errorKey: 'game.error.invalidDeck' }, { status: 400 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { gameMode: true, status: true },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.gameMode !== 'sealed') {
      return NextResponse.json({ error: 'Not a sealed tournament' }, { status: 400 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Registration is closed' }, { status: 400 });
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
      select: { id: true, sealedPool: true },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 404 });
    }
    const pool = participant.sealedPool as { allCards?: Array<{ id: string }> } | null;
    if (!pool || !Array.isArray(pool.allCards)) {
      return NextResponse.json({ error: 'No sealed pool on file' }, { status: 400 });
    }

    const poolCount = new Map<string, number>();
    for (const c of pool.allCards) {
      poolCount.set(c.id, (poolCount.get(c.id) ?? 0) + 1);
    }
    for (const cid of cardIds) {
      const remaining = poolCount.get(cid) ?? 0;
      if (remaining <= 0) {
        return NextResponse.json({ error: `Card ${cid} not in your sealed pool`, errorKey: 'game.error.invalidDeck' }, { status: 400 });
      }
      poolCount.set(cid, remaining - 1);
    }

    for (const cid of cardIds) {
      if (!getCharacterById(cid)) {
        return NextResponse.json({ error: `Unknown character ${cid}` }, { status: 400 });
      }
    }
    const missions = getPlayableMissions();
    const missionsById = new Map(missions.map((m) => [m.id, m]));
    for (const mid of missionIds) {
      if (!missionsById.has(mid) && !getMissionById(mid)) {
        return NextResponse.json({ error: `Unknown mission ${mid}` }, { status: 400 });
      }
    }

    await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: { sealedDeck: { cardIds, missionIds } as never },
    });

    const io = getSocketIO();
    if (io) io.to(`tournament:${id}`).emit('tournament:refresh');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API] POST sealed-deck error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
