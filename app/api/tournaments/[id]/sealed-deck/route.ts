import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { getPlayableMissions } from '@/lib/data/cardLoader';
import { getSocketIO } from '@/lib/socket/server';
import { checkSealedDeckAgainstPool, findBannedCardInSealedDeck } from '@/lib/tournament/sealedRegistration';

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

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { gameMode: true, status: true, bannedCardIds: true, useBanList: true, maxPlayers: true },
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

    let participant = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
      select: { id: true, sealedPool: true, deckValid: true },
    });

    if (!participant) {
      const claim = await prisma.sealedPoolClaim.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
        select: { pool: true },
      });

      if (!claim) {
        return NextResponse.json(
          { error: 'Not a participant', errorKey: 'tournament.error.notParticipant' },
          { status: 404 },
        );
      }

      const seatsTaken = await prisma.tournamentParticipant.count({ where: { tournamentId: id } });
      if (seatsTaken >= tournament.maxPlayers) {
        console.warn(
          `[API] Sealed tournament ${id}: ${session.user.id} finished a deck after their seat was released, and the tournament is full`,
        );
        return NextResponse.json(
          { error: 'Your seat was released while you were building', errorKey: 'tournament.error.sealedSeatLost' },
          { status: 409 },
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      });
      const restored = await prisma.tournamentParticipant.create({
        data: {
          tournamentId: id,
          userId: session.user.id,
          username: user?.username || 'Unknown',
          sealedPool: claim.pool as never,
        },
        select: { id: true, sealedPool: true, deckValid: true },
      });
      participant = restored;
      console.log(
        `[API] Sealed tournament ${id}: ${session.user.id} submitted after their reservation expired, seat restored with the original pool`,
      );
    }
    if (participant.deckValid) {
      return NextResponse.json(
        { error: 'Your sealed deck is already locked in', errorKey: 'tournament.error.sealedDeckLocked' },
        { status: 409 },
      );
    }
    const pool = participant.sealedPool as { allCards?: Array<{ id: string }> } | null;
    if (!pool || !Array.isArray(pool.allCards)) {
      return NextResponse.json({ error: 'No sealed pool on file' }, { status: 400 });
    }

    const poolCheck = checkSealedDeckAgainstPool(pool.allCards.map((c) => c.id), cardIds, missionIds);
    if (!poolCheck.valid) {
      return NextResponse.json(
        { error: 'Sealed deck is not legal', errorKey: poolCheck.errorKey, offendingCardId: poolCheck.offendingCardId },
        { status: 400 },
      );
    }

    const bannedIds = new Set<string>(tournament.bannedCardIds ?? []);
    if (tournament.useBanList) {
      const globalBans = await prisma.bannedCard.findMany({ select: { cardId: true } });
      for (const b of globalBans) bannedIds.add(b.cardId);
    }
    const bannedInDeck = findBannedCardInSealedDeck(bannedIds, cardIds, missionIds);
    if (bannedInDeck) {
      return NextResponse.json(
        { error: `Card ${bannedInDeck} is banned in this tournament`, errorKey: 'tournament.error.sealedCardBanned', offendingCardId: bannedInDeck },
        { status: 400 },
      );
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
      data: { sealedDeck: { cardIds, missionIds } as never, deckValid: true },
    });

    const io = getSocketIO();
    if (io) io.to(`tournament:${id}`).emit('tournament:refresh');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API] POST sealed-deck error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
