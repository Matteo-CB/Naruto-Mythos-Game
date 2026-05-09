import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getDeckStats } from '@/lib/db/deckStats';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deck = await prisma.deck.findUnique({
      where: { id },
      select: { userId: true, name: true },
    });
    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
    }
    if (deck.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stats = await getDeckStats(id);
    if (!stats) {
      return NextResponse.json({
        deckId: id,
        deckName: deck.name,
        wins: 0,
        losses: 0,
        draws: 0,
        eloDeltaSum: 0,
        gamesTotal: 0,
        winrate: 0,
        lastPlayedAt: null,
        daily: [],
      });
    }

    const gamesTotal = stats.wins + stats.losses + stats.draws;
    const winrate = gamesTotal > 0 ? Math.round((stats.wins / gamesTotal) * 100) : 0;

    return NextResponse.json({
      deckId: id,
      deckName: deck.name,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      eloDeltaSum: stats.eloDeltaSum,
      gamesTotal,
      winrate,
      lastPlayedAt: stats.lastPlayedAt.toISOString(),
      daily: stats.daily,
    });
  } catch (err) {
    console.error('[deckStats] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
