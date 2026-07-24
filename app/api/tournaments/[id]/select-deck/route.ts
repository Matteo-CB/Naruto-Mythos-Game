import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { validateDeckForTournament } from '@/lib/tournament/deckValidation';
import { getHiddenCardIds } from '@/lib/cards/reveal';
import { holoBaseId } from '@/lib/holo/holoId';
import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';
import { getSocketIO } from '@/lib/socket/server';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', errorKey: 'tournament.error.unauthorized' }, { status: 401 });
    }

    const { id: tournamentId } = await params;
    const body = await request.json();
    const { deckId } = body;

    if (!deckId || typeof deckId !== 'string') {
      return NextResponse.json({ error: 'deckId is required', errorKey: 'tournament.error.deckIdRequired' }, { status: 400 });
    }


    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found', errorKey: 'tournament.error.notFound' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Tournament is no longer accepting deck changes', errorKey: 'tournament.error.deckChangesClosed' }, { status: 400 });
    }


    const participant = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId, userId: session.user.id },
    });
    if (!participant) {
      return NextResponse.json({ error: 'You are not in this tournament', errorKey: 'tournament.error.notInTournament' }, { status: 403 });
    }


    if (tournament.gameMode === 'sealed') {
      return NextResponse.json({ error: 'Sealed mode builds decks in-game', errorKey: 'tournament.error.sealedModeInGame' }, { status: 400 });
    }


    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck || deck.userId !== session.user.id) {
      return NextResponse.json({ error: 'Deck not found or not yours', errorKey: 'tournament.error.deckNotFound' }, { status: 404 });
    }

    const variantCheck = await validateDeckVariantUnlocks(session.user.id, deck.cardIds);
    if (!variantCheck.ok) {
      return NextResponse.json(
        { error: 'Deck contains locked variant cards', errorKey: 'deckBuilder.error.variantLocked', lockedCardIds: variantCheck.lockedCardIds },
        { status: 400 },
      );
    }

    // Unrevealed cards are never allowed in a tournament, even when the ban list is off
    // (e.g. the Monday all-cards tournament). Revealed revealing-set cards remain allowed.
    const hidden = await getHiddenCardIds();
    if (hidden.size > 0) {
      const hiddenInDeck = [...deck.cardIds, ...deck.missionIds].some((id) => hidden.has(holoBaseId(id)));
      if (hiddenInDeck) {
        return NextResponse.json(
          { error: 'Deck contains unrevealed cards', errorKey: 'tournament.error.unrevealedCards' },
          { status: 400 },
        );
      }
    }


    let effectiveTournament = tournament;
    if (tournament.useBanList) {
      const globalBanned = await prisma.bannedCard.findMany({ select: { cardId: true } });
      const globalIds = globalBanned.map(b => b.cardId);
      const merged = [...new Set([...(tournament.bannedCardIds ?? []), ...globalIds])];
      effectiveTournament = { ...tournament, bannedCardIds: merged };
    }

    
    const validation = validateDeckForTournament(deck, effectiveTournament);

    
    const previousDeckId = participant.deckId;
    const previousDeckValid = participant.deckValid;
    await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        deckId,
        deckValid: validation.valid,
      },
    });

    const fresh = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true },
    });
    if (fresh?.status !== 'registration') {
      await prisma.tournamentParticipant.update({
        where: { id: participant.id },
        data: { deckId: previousDeckId, deckValid: previousDeckValid },
      }).catch(() => {});
      return NextResponse.json({ error: 'Tournament is no longer accepting deck changes', errorKey: 'tournament.error.deckChangesClosed' }, { status: 400 });
    }

    const io = getSocketIO();
    if (io) io.to(`tournament:${tournamentId}`).emit('tournament:refresh');

    return NextResponse.json({
      deckId,
      deckValid: validation.valid,
      errors: validation.errors,
      errorKeys: validation.errorKeys,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error', errorKey: 'tournament.error.serverError' }, { status: 500 });
  }
}
