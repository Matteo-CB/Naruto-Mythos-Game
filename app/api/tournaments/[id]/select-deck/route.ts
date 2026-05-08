import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { validateDeckForTournament } from '@/lib/tournament/deckValidation';
import { getSocketIO } from '@/lib/socket/server';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: tournamentId } = await params;
    const body = await request.json();
    const { deckId } = body;

    if (!deckId || typeof deckId !== 'string') {
      return NextResponse.json({ error: 'deckId is required' }, { status: 400 });
    }

    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Tournament is no longer accepting deck changes' }, { status: 400 });
    }

    
    const participant = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId, userId: session.user.id },
    });
    if (!participant) {
      return NextResponse.json({ error: 'You are not in this tournament' }, { status: 403 });
    }

    
    if (tournament.gameMode === 'sealed') {
      return NextResponse.json({ error: 'Sealed mode builds decks in-game' }, { status: 400 });
    }

    
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck || deck.userId !== session.user.id) {
      return NextResponse.json({ error: 'Deck not found or not yours' }, { status: 404 });
    }

    
    let effectiveTournament = tournament;
    if (tournament.useBanList) {
      const globalBanned = await prisma.bannedCard.findMany({ select: { cardId: true } });
      const globalIds = globalBanned.map(b => b.cardId);
      const merged = [...new Set([...(tournament.bannedCardIds ?? []), ...globalIds])];
      effectiveTournament = { ...tournament, bannedCardIds: merged };
    }

    
    const validation = validateDeckForTournament(deck, effectiveTournament);

    
    await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        deckId,
        deckValid: validation.valid,
      },
    });

    const io = getSocketIO();
    if (io) io.to(`tournament:${tournamentId}`).emit('tournament:refresh');

    return NextResponse.json({
      deckId,
      deckValid: validation.valid,
      errors: validation.errors,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
