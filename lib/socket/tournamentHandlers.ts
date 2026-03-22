/**
 * Socket.io handlers for tournament real-time events.
 */
import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/db/prisma';
import { startAbsenceTimer, clearAbsenceTimer } from '@/lib/tournament/absenceManager';
import { assignTournamentWinnerRole } from '@/lib/discord/tournamentRoles';
import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';

const matchReadyPlayers = new Map<string, Set<string>>();

export function registerTournamentHandlers(io: Server, socket: Socket) {
  socket.on('tournament:subscribe', ({ tournamentId }: { tournamentId: string }) => {
    socket.join(`tournament:${tournamentId}`);
  });

  socket.on('tournament:unsubscribe', ({ tournamentId }: { tournamentId: string }) => {
    socket.leave(`tournament:${tournamentId}`);
  });

  socket.on('tournament:ready', async ({ tournamentId, matchId, userId }: {
    tournamentId: string; matchId: string; userId: string;
  }) => {
    try {
      const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
      if (!match || match.tournamentId !== tournamentId) return;
      if (match.status !== 'ready' && match.status !== 'pending') return;

      if (!matchReadyPlayers.has(matchId)) matchReadyPlayers.set(matchId, new Set());
      const ready = matchReadyPlayers.get(matchId)!;
      ready.add(userId);

      if (ready.size === 1) {
        const absentPlayerId = match.player1Id === userId ? match.player2Id : match.player1Id;
        if (absentPlayerId) {
          const deadline = startAbsenceTimer(matchId, async () => {
            await handleMatchForfeit(io, tournamentId, matchId, absentPlayerId);
            matchReadyPlayers.delete(matchId);
          });
          await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { absenceDeadline: deadline, absentPlayerId },
          });
          io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
            matchId, playerId: absentPlayerId, deadline: deadline.toISOString(),
          });
        }
      }

      if (ready.size >= 2 && match.player1Id && match.player2Id) {
        clearAbsenceTimer(matchId);
        matchReadyPlayers.delete(matchId);
        const roomCode = `T-${matchId.slice(-6)}`;
        await prisma.tournamentMatch.update({
          where: { id: matchId },
          data: { status: 'in_progress', roomCode, startedAt: new Date(), absenceDeadline: null, absentPlayerId: null },
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:match-ready', {
          matchId, roomCode, player1Id: match.player1Id, player2Id: match.player2Id,
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
          matchId, status: 'in_progress', roomCode,
        });
      }
    } catch (err) {
      console.error('[Tournament] Ready handler error:', err);
    }
  });

  socket.on('tournament:report-present', async ({ matchId }: { matchId: string }) => {
    clearAbsenceTimer(matchId);
  });
}

async function handleMatchForfeit(io: Server, tournamentId: string, matchId: string, forfeitPlayerId: string) {
  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status === 'completed' || match.status === 'forfeit') return;

  const winnerId = match.player1Id === forfeitPlayerId ? match.player2Id : match.player1Id;
  const winnerUsername = match.player1Id === forfeitPlayerId ? match.player2Username : match.player1Username;

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { status: 'forfeit', winnerId, winnerUsername, completedAt: new Date() },
  });
  await prisma.tournamentParticipant.updateMany({
    where: { tournamentId, userId: forfeitPlayerId },
    data: { eliminated: true, eliminatedRound: match.round },
  });
  io.to(`tournament:${tournamentId}`).emit('tournament:player-forfeited', {
    matchId, forfeitedPlayerId: forfeitPlayerId, winnerId, winnerUsername,
  });
  if (winnerId) await advanceMatchWinner(io, tournamentId, match, winnerId, winnerUsername);
}

export async function handleTournamentMatchEnd(io: Server, tournamentId: string, matchId: string, winnerId: string, gameId: string) {
  try {
    const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) return;
    clearAbsenceTimer(matchId);
    matchReadyPlayers.delete(matchId);

    const winnerUsername = match.player1Id === winnerId ? match.player1Username : match.player2Username;
    const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;

    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'completed', winnerId, winnerUsername, gameId, completedAt: new Date() },
    });
    if (loserId) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId, userId: loserId },
        data: { eliminated: true, eliminatedRound: match.round },
      });
    }
    io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
      matchId, status: 'completed', winnerId, winnerUsername, gameId,
    });
    await advanceMatchWinner(io, tournamentId, match, winnerId, winnerUsername);
  } catch (err) {
    console.error('[Tournament] Match end handler error:', err);
  }
}

async function advanceMatchWinner(io: Server, tournamentId: string, match: { round: number; matchIndex: number }, winnerId: string, winnerUsername: string | null) {
  const nextRound = match.round + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isTopSlot = match.matchIndex % 2 === 0;

  const nextMatch = await prisma.tournamentMatch.findUnique({
    where: { tournamentId_round_matchIndex: { tournamentId, round: nextRound, matchIndex: nextMatchIndex } },
  });

  if (!nextMatch) {
    // Tournament completed — this was the final match
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'completed', winnerId, winnerUsername, completedAt: new Date() },
    });
    const updatedUser = await prisma.user.update({
      where: { id: winnerId },
      data: { tournamentWins: { increment: 1 } },
    });
    io.to(`tournament:${tournamentId}`).emit('tournament:completed', { winnerId, winnerUsername });

    // Assign "Vainqueur de tournoi X" Discord role
    let newRoleName: string | null = null;
    try {
      newRoleName = await assignTournamentWinnerRole(winnerId, updatedUser.tournamentWins);
    } catch (err) {
      console.error('[Tournament] Discord role assign error:', err);
    }

    // Build podium and send webhook
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { matches: true, _count: { select: { participants: true } } },
      });
      if (tournament) {
        // Finalist = loser of the final match
        const finalMatch = tournament.matches.find(m => m.round === match.round && m.matchIndex === match.matchIndex);
        const finalistId = finalMatch?.player1Id === winnerId ? finalMatch?.player2Id : finalMatch?.player1Id;
        const finalistUsername = finalMatch?.player1Id === winnerId ? finalMatch?.player2Username : finalMatch?.player1Username;

        // Semi-finalist = losers of semi-final matches (round before final)
        const semiRound = match.round - 1;
        const semiMatches = tournament.matches.filter(m => m.round === semiRound && m.status === 'completed');
        const semiLosers = semiMatches
          .map(m => m.winnerId === m.player1Id
            ? { userId: m.player2Id!, username: m.player2Username! }
            : { userId: m.player1Id!, username: m.player1Username! })
          .filter(l => l.userId && l.userId !== finalistId);
        const thirdPlace = semiLosers[0];

        const podium = [
          { userId: winnerId, username: winnerUsername ?? 'Unknown', place: 1 as const },
          ...(finalistId && finalistUsername ? [{ userId: finalistId, username: finalistUsername, place: 2 as const }] : []),
          ...(thirdPlace ? [{ userId: thirdPlace.userId, username: thirdPlace.username, place: 3 as const }] : []),
        ];
        await sendTournamentResults(tournament.name, podium, tournament._count.participants, newRoleName);
      }
    } catch (err) {
      console.error('[Tournament] Webhook error:', err);
    }
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (isTopSlot) { updateData.player1Id = winnerId; updateData.player1Username = winnerUsername; }
  else { updateData.player2Id = winnerId; updateData.player2Username = winnerUsername; }

  const updated = await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: updateData });
  const p1 = isTopSlot ? winnerId : updated.player1Id;
  const p2 = isTopSlot ? updated.player2Id : winnerId;
  if (p1 && p2) {
    await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: { status: 'ready' } });
  }

  io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId: nextMatch.id,
    player1Id: isTopSlot ? winnerId : updated.player1Id,
    player1Username: isTopSlot ? winnerUsername : updated.player1Username,
    player2Id: isTopSlot ? updated.player2Id : winnerId,
    player2Username: isTopSlot ? updated.player2Username : winnerUsername,
    status: (p1 && p2) ? 'ready' : 'pending',
  });

  const allRoundMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId, round: match.round } });
  const roundComplete = allRoundMatches.every(m => m.status === 'completed' || m.status === 'forfeit');
  if (roundComplete) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { currentRound: nextRound } });
    io.to(`tournament:${tournamentId}`).emit('tournament:round-complete', { completedRound: match.round, nextRound });
  }
}
