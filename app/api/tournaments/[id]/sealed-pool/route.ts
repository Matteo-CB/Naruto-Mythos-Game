import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

import { SEALED_BUILD_WINDOW_MS } from '@/lib/tournament/sealedRegistration';

export { SEALED_BUILD_WINDOW_MS };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { gameMode: true },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.gameMode !== 'sealed') {
      return NextResponse.json({ error: 'Not a sealed tournament' }, { status: 400 });
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
      select: {
        sealedPool: true,
        sealedDeck: true,
        joinedAt: true,
      },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 404 });
    }

    const deadlineMs = participant.joinedAt.getTime() + SEALED_BUILD_WINDOW_MS;
    return NextResponse.json({
      pool: participant.sealedPool ?? null,
      deck: participant.sealedDeck ?? null,
      deadline: deadlineMs,
      now: Date.now(),
    });
  } catch (err) {
    console.error('[API] GET sealed-pool error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
