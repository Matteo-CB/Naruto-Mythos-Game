import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getSocketIO } from '@/lib/socket/server';


export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', errorKey: 'tournament.error.unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found', errorKey: 'tournament.error.notFound' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Cannot leave after tournament started', errorKey: 'tournament.error.cannotLeaveStarted' }, { status: 400 });
    }

    
    if (tournament.creatorId === session.user.id) {
      return NextResponse.json({ error: 'Creator cannot leave. Cancel the tournament instead.', errorKey: 'tournament.error.creatorCannotLeave' }, { status: 400 });
    }

    const existing = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId: id, userId: session.user.id },
    });

    await prisma.tournamentParticipant.deleteMany({
      where: { tournamentId: id, userId: session.user.id },
    });

    const fresh = await prisma.tournament.findUnique({
      where: { id },
      select: { status: true },
    });
    if (fresh?.status !== 'registration' && existing) {
      await prisma.tournamentParticipant.create({
        data: {
          tournamentId: existing.tournamentId,
          userId: existing.userId,
          username: existing.username,
          seed: existing.seed,
          eliminated: existing.eliminated,
          eliminatedRound: existing.eliminatedRound,
          hasBye: existing.hasBye,
          deckId: existing.deckId,
          deckValid: existing.deckValid,
          sealedPool: existing.sealedPool ?? undefined,
        },
      }).catch(() => {});
      return NextResponse.json({ error: 'Tournament started before your leave was processed', errorKey: 'tournament.error.startedDuringLeave' }, { status: 400 });
    }

    const io = getSocketIO();
    if (io) io.to(`tournament:${id}`).emit('tournament:refresh');

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error', errorKey: 'tournament.error.serverError' }, { status: 500 });
  }
}
