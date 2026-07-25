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
    const userId = session.user.id;
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found', errorKey: 'tournament.error.notFound' }, { status: 404 });
    }

    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return NextResponse.json({ error: 'Tournament already finished', errorKey: 'tournament.error.alreadyFinished' }, { status: 400 });
    }

    if (tournament.creatorId === userId && tournament.status === 'registration') {
      return NextResponse.json({ error: 'Creator cannot leave. Cancel the tournament instead.', errorKey: 'tournament.error.creatorCannotLeave' }, { status: 400 });
    }

    if (tournament.status === 'registration') {
      const existing = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId: id, userId },
      });

      await prisma.tournamentParticipant.deleteMany({
        where: { tournamentId: id, userId },
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
            sealedDeck: existing.sealedDeck ?? undefined,
          },
        }).catch(() => {});
        return NextResponse.json({ error: 'Tournament started before your leave was processed', errorKey: 'tournament.error.startedDuringLeave' }, { status: 400 });
      }
      const io = getSocketIO();
      if (io) io.to(`tournament:${id}`).emit('tournament:refresh');
      return NextResponse.json({ success: true });
    }

    const participant = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId: id, userId },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Not in this tournament', errorKey: 'tournament.error.notInTournament' }, { status: 400 });
    }
    if (participant.eliminated) {
      return NextResponse.json({ success: true, already: true });
    }

    const isDoubleElim = tournament.format === 'double_elimination';

    if (!isDoubleElim) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId: id, userId },
        data: { eliminated: true, eliminatedRound: tournament.currentRound || 0 },
      });
    }

    const activeMatch = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId: id,
        status: { in: ['ready', 'in_progress', 'pending'] },
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
    });

    const io = getSocketIO();

    if (activeMatch && io) {
      const { advanceMatchWinnerDoubleElim, advanceMatchWinner, handleSwissMatchEnd } =
        await import('@/lib/socket/tournamentHandlers');
      const winnerId = activeMatch.player1Id === userId ? activeMatch.player2Id : activeMatch.player1Id;
      const winnerUsername = activeMatch.player1Id === userId ? activeMatch.player2Username : activeMatch.player1Username;

      if (winnerId) {
        await prisma.tournamentMatch.update({
          where: { id: activeMatch.id },
          data: { status: 'forfeit', winnerId, winnerUsername, completedAt: new Date() },
        });
        const { logMatchEvent } = await import('@/lib/tournament/matchEventLog');
        logMatchEvent({
          type: 'match.forfeit.admin',
          tournamentId: id,
          matchId: activeMatch.id,
          bracket: activeMatch.bracket ?? undefined,
          round: activeMatch.round,
          matchIndex: activeMatch.matchIndex,
          forfeitedPlayerId: userId,
          winnerId,
          reason: 'voluntary_leave',
        });
        if (activeMatch.roomCode) {
          const { rooms } = await import('@/lib/socket/server');
          const { finalizeAndScheduleRoomDeletion } = await import('@/lib/tournament/matchRoomCleanup');
          const { clearAbsenceTimer } = await import('@/lib/tournament/absenceManager');
          if (rooms.get(activeMatch.roomCode)) {
            io.to(activeMatch.roomCode).emit('tournament:player-left', { matchId: activeMatch.id, userId });
            finalizeAndScheduleRoomDeletion(rooms, activeMatch.roomCode);
          }
          clearAbsenceTimer(activeMatch.id);
        }
        io.to(`tournament:${id}`).emit('tournament:player-forfeited', {
          matchId: activeMatch.id, forfeitedPlayerId: userId, winnerId, winnerUsername,
        });

        if (tournament.format === 'swiss') {
          await handleSwissMatchEnd(io, id, activeMatch);
        } else if (isDoubleElim) {
          await advanceMatchWinnerDoubleElim(io, id, activeMatch as never, winnerId, winnerUsername, userId);
        } else {
          await advanceMatchWinner(io, id, activeMatch, winnerId, winnerUsername);
        }
      } else {
        await prisma.tournamentMatch.update({
          where: { id: activeMatch.id },
          data: { status: 'forfeit', winnerId: null, winnerUsername: null, completedAt: new Date() },
        });
      }
    }

    if (io) io.to(`tournament:${id}`).emit('tournament:refresh');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error', errorKey: 'tournament.error.serverError' }, { status: 500 });
  }
}
