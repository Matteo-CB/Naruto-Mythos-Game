import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getSocketIO } from '@/lib/socket/server';
import { advanceMatchWinner, advanceMatchWinnerDoubleElim, handleSwissMatchEnd } from '@/lib/socket/tournamentHandlers';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, matchId } = await params;
    const body = await req.json();
    const { forfeitPlayerId } = body;

    if (!forfeitPlayerId) {
      return NextResponse.json({ error: 'forfeitPlayerId required' }, { status: 400 });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const isCreator = tournament.creatorId === session.user.id;
    if (!isCreator && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    if (match.status === 'completed' || match.status === 'forfeit') {
      return NextResponse.json({ error: 'Match already resolved' }, { status: 400 });
    }

    let winnerId: string | null = null;
    let winnerUsername: string | null = null;
    if (match.player1Id === forfeitPlayerId) {
      winnerId = match.player2Id;
      winnerUsername = match.player2Username;
    } else if (match.player2Id === forfeitPlayerId) {
      winnerId = match.player1Id;
      winnerUsername = match.player1Username;
    } else {
      return NextResponse.json({ error: 'Player not in this match' }, { status: 400 });
    }

    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: {
        status: 'forfeit',
        winnerId,
        winnerUsername,
        completedAt: new Date(),
      },
    });

    if (match.roomCode) {
      const { rooms } = await import('@/lib/socket/server');
      const room = rooms.get(match.roomCode);
      if (room) {
        room.finalized = true;
        if (room.tournamentJoinTimer) { clearTimeout(room.tournamentJoinTimer); room.tournamentJoinTimer = null; }
        if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }
        if (room.actionTimer) { clearTimeout(room.actionTimer); room.actionTimer = null; }
        if (room.mulliganTimer) { clearTimeout(room.mulliganTimer); room.mulliganTimer = null; }
        setTimeout(() => {
          const r = rooms.get(match.roomCode!);
          if (r === room) rooms.delete(match.roomCode!);
        }, 10_000);
      }
      const { clearAbsenceTimer } = await import('@/lib/tournament/absenceManager');
      clearAbsenceTimer(matchId);
    }

    if (tournament.format !== 'swiss' && tournament.format !== 'double_elimination') {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId: id, userId: forfeitPlayerId },
        data: { eliminated: true, eliminatedRound: match.round },
      });
    }

    const io = getSocketIO();

    if (winnerId) {
      if (tournament.format === 'double_elimination') {
        await advanceMatchWinnerDoubleElim(
          io,
          id,
          { ...match, bracket: match.bracket } as never,
          winnerId,
          winnerUsername,
          forfeitPlayerId,
        );
      } else if (tournament.format === 'swiss') {
        if (io) await handleSwissMatchEnd(io, id, match);
      } else {
        await advanceMatchWinner(
          io,
          id,
          match,
          winnerId,
          winnerUsername,
        );
      }
    }

    if (io) {
      io.to(`tournament:${id}`).emit('tournament:player-forfeited', {
        matchId, forfeitedPlayerId: forfeitPlayerId, winnerId, winnerUsername,
      });
      io.to(`tournament:${id}`).emit('tournament:refresh');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Tournament] forfeit route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
