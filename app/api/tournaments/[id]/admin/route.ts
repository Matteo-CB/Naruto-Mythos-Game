import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { assignTournamentWinnerRole, removeTournamentRole } from '@/lib/discord/tournamentRoles';
import { advanceMatchWinner } from '@/lib/socket/tournamentHandlers';
import { getSocketIO } from '@/lib/socket/server';
import { computeStandings } from '@/lib/tournament/swissEngine';

async function logAdminAction(params: {
  tournamentId: string;
  actorId: string;
  actorUsername: string;
  action: string;
  targetUserId?: string;
  targetUsername?: string;
  matchId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.tournamentAdminLog.create({
      data: {
        tournamentId: params.tournamentId,
        actorId: params.actorId,
        actorUsername: params.actorUsername,
        action: params.action,
        targetUserId: params.targetUserId,
        targetUsername: params.targetUsername,
        matchId: params.matchId,
        details: params.details as never,
      },
    });
  } catch (err) {
    console.error('[Tournament] logAdminAction error:', err);
  }
}

async function broadcastTournamentRefresh(tournamentId: string): Promise<void> {
  const io = getSocketIO();
  if (!io) return;
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: true,
        matches: { orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }] },
      },
    });
    if (!t) return;
    if (t.format === 'swiss') {
      const players = t.participants.map((p, i) => ({
        userId: p.userId, username: p.username, seed: p.seed ?? (i + 1),
      }));
      const results = t.matches
        .filter(m => m.status === 'completed' || m.status === 'forfeit')
        .filter(m => m.player1Id !== null)
        .map(m => ({
          round: m.round,
          player1Id: m.player1Id!,
          player2Id: m.player2Id ?? m.player1Id!,
          winnerId: m.winnerId,
          isBye: m.isBye,
        }));
      const standings = computeStandings(players, results);
      io.to(`tournament:${tournamentId}`).emit('tournament:standings-updated', { standings });
    }
    io.to(`tournament:${tournamentId}`).emit('tournament:refresh');
  } catch (err) {
    console.error('[Tournament] broadcastTournamentRefresh error:', err);
  }
}

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}


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
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true, matches: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const isCreator = tournament.creatorId === session.user.id;
    if (!isCreator && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    const actorId = session.user.id;
    const actorUsername = session.user.name ?? 'unknown';

    const matchMutatingActions = new Set(['disqualify', 'setMatchWinner', 'resetMatch']);
    if (matchMutatingActions.has(action) && tournament.status === 'cancelled') {
      return NextResponse.json({ error: 'Tournament is cancelled, no match changes allowed' }, { status: 400 });
    }

    switch (action) {
      
      case 'disqualify': {
        const { userId, reason } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        const participantExists = await prisma.tournamentParticipant.findFirst({
          where: { tournamentId, userId },
          select: { id: true },
        });
        if (!participantExists) {
          return NextResponse.json({ error: 'Participant not found in this tournament' }, { status: 404 });
        }

        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId },
          data: { eliminated: true, eliminatedRound: tournament.currentRound || 0 },
        });
        if (tournament.gameMode === 'sealed') {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId },
            data: { sealedPool: null as never },
          });
        }

        const activeMatch = tournament.matches.find(
          m => (m.player1Id === userId || m.player2Id === userId)
            && (m.status === 'ready' || m.status === 'in_progress' || m.status === 'pending')
            && m.player1Id !== null && m.player2Id !== null,
        );
        if (activeMatch) {
          const winnerId = activeMatch.player1Id === userId ? activeMatch.player2Id : activeMatch.player1Id;
          const winnerUsername = activeMatch.player1Id === userId ? activeMatch.player2Username : activeMatch.player1Username;
          await prisma.tournamentMatch.update({
            where: { id: activeMatch.id },
            data: {
              status: 'forfeit', winnerId, winnerUsername,
              completedAt: new Date(),
            },
          });

          if (activeMatch.roomCode) {
            const { rooms } = await import('@/lib/socket/server');
            const room = rooms.get(activeMatch.roomCode);
            if (room) {
              const ioInst = getSocketIO();
              if (ioInst) ioInst.to(activeMatch.roomCode).emit('tournament:disqualified', { matchId: activeMatch.id, userId });
              room.finalized = true;
              if (room.tournamentJoinTimer) { clearTimeout(room.tournamentJoinTimer); room.tournamentJoinTimer = null; }
              if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }
              if (room.actionTimer) { clearTimeout(room.actionTimer); room.actionTimer = null; }
              if (room.mulliganTimer) { clearTimeout(room.mulliganTimer); room.mulliganTimer = null; }
              setTimeout(() => {
                const stillThere = rooms.get(activeMatch.roomCode!);
                if (stillThere) rooms.delete(activeMatch.roomCode!);
              }, 10_000);
            }
          }

          const { clearAbsenceTimer } = await import('@/lib/tournament/absenceManager');
          clearAbsenceTimer(activeMatch.id);

          if (winnerId) {
            const ioInst = getSocketIO();
            if (tournament.format === 'double_elimination') {
              const { advanceMatchWinnerDoubleElim } = await import('@/lib/socket/tournamentHandlers');
              await advanceMatchWinnerDoubleElim(ioInst, tournamentId, activeMatch as never, winnerId, winnerUsername, userId);
            } else if (tournament.format === 'swiss') {
              if (ioInst) {
                const { handleSwissMatchEnd } = await import('@/lib/socket/tournamentHandlers');
                await handleSwissMatchEnd(ioInst, tournamentId, activeMatch);
              }
            } else {
              await advanceMatchWinner(ioInst, tournamentId, activeMatch, winnerId, winnerUsername);
            }
          }
        }

        const dqUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'disqualify',
          targetUserId: userId,
          targetUsername: dqUser?.username,
          details: { reason: reason ?? null },
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true, message: `Player disqualified${reason ? ': ' + reason : ''}` });
      }


      case 'reinstate': {
        const { userId } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (tournament.status !== 'registration') {
          return NextResponse.json({ error: 'Can only reinstate during registration' }, { status: 400 });
        }
        const participant = await prisma.tournamentParticipant.findFirst({
          where: { tournamentId, userId },
          select: { id: true, eliminated: true },
        });
        if (!participant) {
          return NextResponse.json({ error: 'Participant not found in this tournament' }, { status: 404 });
        }
        if (!participant.eliminated) {
          return NextResponse.json({ error: 'Participant is not eliminated' }, { status: 400 });
        }
        await prisma.tournamentParticipant.update({
          where: { id: participant.id },
          data: { eliminated: false, eliminatedRound: null },
        });
        const reUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'reinstate',
          targetUserId: userId,
          targetUsername: reUser?.username,
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true, message: 'Participant reinstated' });
      }


      case 'setMatchWinner': {
        const { matchId, winnerId, force } = body;
        if (!matchId || !winnerId) return NextResponse.json({ error: 'matchId and winnerId required' }, { status: 400 });

        const match = tournament.matches.find(m => m.id === matchId);
        if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

        if ((match.status === 'completed' || match.status === 'forfeit') && !force) {
          return NextResponse.json({
            error: `Match already ${match.status}. Pass { force: true } to override.`,
            currentWinnerId: match.winnerId,
          }, { status: 409 });
        }

        if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
          return NextResponse.json({ error: 'winnerId must match one of the match players' }, { status: 400 });
        }

        const winnerUsername = match.player1Id === winnerId ? match.player1Username : match.player2Username;
        const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;
        const previousWinnerId = match.winnerId;

        if (force && previousWinnerId && previousWinnerId !== winnerId && tournament.format !== 'swiss') {
          let blockingMatch: { round: number; matchIndex: number; bracket: string | null } | null = null;
          if (tournament.format === 'elimination') {
            const nextMatchInBracket = tournament.matches.find(m =>
              m.bracket === match.bracket && m.round === match.round + 1 && m.matchIndex === Math.floor(match.matchIndex / 2),
            );
            if (nextMatchInBracket && (nextMatchInBracket.status === 'completed' || nextMatchInBracket.status === 'forfeit')) {
              blockingMatch = nextMatchInBracket;
            }
          } else if (tournament.format === 'double_elimination') {
            const downstream = tournament.matches.filter(m =>
              (m.player1Id === previousWinnerId || m.player2Id === previousWinnerId) &&
              m.id !== match.id &&
              (m.status === 'completed' || m.status === 'forfeit'),
            );
            if (downstream.length > 0) blockingMatch = downstream[0];
          }
          if (blockingMatch) {
            return NextResponse.json({
              error: `Cannot override: match ${blockingMatch.bracket ?? 'main'} R${blockingMatch.round} M${blockingMatch.matchIndex} has already concluded with the previous winner. Reset that match first to clear the chain.`,
            }, { status: 409 });
          }
        }

        await prisma.tournamentMatch.update({
          where: { id: matchId },
          data: { status: 'completed', winnerId, winnerUsername, completedAt: new Date() },
        });

        if (loserId) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: loserId },
            data: { eliminated: true, eliminatedRound: match.round },
          });
        }

        
        
        if (previousWinnerId && previousWinnerId !== winnerId && tournament.winnerId === previousWinnerId) {
          
          try { await removeTournamentRole(previousWinnerId); } catch { /* ignore */ }

          
          const newWinnerUser = await prisma.user.update({
            where: { id: winnerId },
            data: { tournamentWins: { increment: 1 } },
          });
          try { await assignTournamentWinnerRole(winnerId, newWinnerUser.tournamentWins); } catch { /* ignore */ }

          
          await prisma.tournament.update({
            where: { id: tournamentId },
            data: { winnerId, winnerUsername },
          });
        }

        
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: winnerId },
          data: { eliminated: false, eliminatedRound: null },
        });


        const ioInst = getSocketIO();
        if (tournament.format === 'double_elimination') {
          const { advanceMatchWinnerDoubleElim } = await import('@/lib/socket/tournamentHandlers');
          await advanceMatchWinnerDoubleElim(ioInst, tournamentId, match as never, winnerId, winnerUsername, loserId);
        } else if (tournament.format === 'swiss' && ioInst) {
          const { handleSwissMatchEnd } = await import('@/lib/socket/tournamentHandlers');
          await handleSwissMatchEnd(ioInst, tournamentId, match);
        } else {
          await advanceMatchWinner(ioInst, tournamentId, match, winnerId, winnerUsername);
        }

        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'setMatchWinner',
          targetUserId: winnerId,
          targetUsername: winnerUsername ?? undefined,
          matchId,
          details: { round: match.round, matchIndex: match.matchIndex, previousWinnerId: previousWinnerId ?? null },
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true, message: `Match winner set to ${winnerUsername}` });
      }

      
      case 'resetMatch': {
        const { matchId: resetMatchId } = body;
        if (!resetMatchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

        const match = tournament.matches.find(m => m.id === resetMatchId);
        if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

        if (tournament.format !== 'swiss' && match.winnerId) {
          let blockingMatch: { round: number; matchIndex: number; bracket: string | null } | null = null;
          if (tournament.format === 'elimination') {
            const next = tournament.matches.find(m =>
              m.bracket === match.bracket && m.round === match.round + 1 && m.matchIndex === Math.floor(match.matchIndex / 2),
            );
            if (next && next.status !== 'pending') blockingMatch = next;
          } else if (tournament.format === 'double_elimination') {
            const downstream = tournament.matches.filter(m =>
              (m.player1Id === match.winnerId || m.player2Id === match.winnerId) &&
              m.id !== match.id &&
              m.status !== 'pending',
            );
            if (downstream.length > 0) blockingMatch = downstream[0];
          }
          if (blockingMatch) {
            return NextResponse.json({
              error: `Cannot reset: match ${blockingMatch.bracket ?? 'main'} R${blockingMatch.round} M${blockingMatch.matchIndex} is already ${blockingMatch.bracket === null ? 'set' : 'in flight or concluded'}. Reset that match first to clear the chain.`,
            }, { status: 409 });
          }
        }

        const { clearAbsenceTimer } = await import('@/lib/tournament/absenceManager');
        clearAbsenceTimer(resetMatchId);

        if (match.roomCode) {
          const { rooms } = await import('@/lib/socket/server');
          const room = rooms.get(match.roomCode);
          if (room) {
            const ioInstance = getSocketIO();
            if (ioInstance) ioInstance.to(match.roomCode).emit('tournament:match-reset', { matchId: resetMatchId });
            rooms.delete(match.roomCode);
          }
        }

        if (tournament.format === 'double_elimination') {
          const { winnerAdvanceTarget, loserDropTarget } = await import('@/lib/tournament/doubleElimEngine');
          const wbCount = tournament.matches.filter((m) => m.bracket === 'winners').length;
          const wbRounds = Math.max(1, ...tournament.matches.filter((m) => m.bracket === 'winners').map((m) => m.round));
          const lbRounds = Math.max(0, ...tournament.matches.filter((m) => m.bracket === 'losers').map((m) => m.round));

          const winTarget = winnerAdvanceTarget(
            { bracket: match.bracket as 'winners' | 'losers' | 'grand_final', round: match.round, matchIndex: match.matchIndex },
            wbRounds, lbRounds,
          );
          if (winTarget) {
            const target = await prisma.tournamentMatch.findFirst({
              where: { tournamentId, bracket: winTarget.bracket, round: winTarget.round, matchIndex: winTarget.matchIndex },
            });
            if (target) {
              const upd: Record<string, unknown> = { status: 'pending' };
              if (winTarget.slot === 'player1') {
                upd.player1Id = null;
                upd.player1Username = null;
              } else {
                upd.player2Id = null;
                upd.player2Username = null;
              }
              await prisma.tournamentMatch.update({ where: { id: target.id }, data: upd });
            }
          }

          if (match.bracket === 'winners') {
            const loseTarget = loserDropTarget(
              { bracket: 'winners', round: match.round, matchIndex: match.matchIndex },
              wbRounds,
            );
            if (loseTarget) {
              const target = await prisma.tournamentMatch.findFirst({
                where: { tournamentId, bracket: loseTarget.bracket, round: loseTarget.round, matchIndex: loseTarget.matchIndex },
              });
              if (target) {
                const upd: Record<string, unknown> = { status: 'pending' };
                if (loseTarget.slot === 'player1') {
                  upd.player1Id = null;
                  upd.player1Username = null;
                } else {
                  upd.player2Id = null;
                  upd.player2Username = null;
                }
                await prisma.tournamentMatch.update({ where: { id: target.id }, data: upd });
              }
            }
          }

          if (match.bracket === 'grand_final' && match.round === 1) {
            await prisma.tournamentMatch.deleteMany({
              where: { tournamentId, bracket: 'grand_final', round: 2 },
            });
          }
          void wbCount;
        } else if (tournament.format === 'elimination') {
          const nextRound = match.round + 1;
          const nextMatchIndex = Math.floor(match.matchIndex / 2);
          const isTopSlot = match.matchIndex % 2 === 0;
          const next = await prisma.tournamentMatch.findFirst({
            where: { tournamentId, bracket: match.bracket, round: nextRound, matchIndex: nextMatchIndex },
          });
          if (next) {
            const upd: Record<string, unknown> = { status: 'pending' };
            if (isTopSlot) {
              upd.player1Id = null;
              upd.player1Username = null;
            } else {
              upd.player2Id = null;
              upd.player2Username = null;
            }
            await prisma.tournamentMatch.update({ where: { id: next.id }, data: upd });
          }
        }

        const newStatus = match.player1Id && match.player2Id ? 'ready' : 'pending';

        await prisma.tournamentMatch.update({
          where: { id: resetMatchId },
          data: {
            status: newStatus, winnerId: null, winnerUsername: null,
            roomCode: null, gameId: null, completedAt: null, startedAt: null,
            absenceDeadline: null, absentPlayerId: null,
          },
        });

        if (match.player1Id) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: match.player1Id, eliminatedRound: match.round },
            data: { eliminated: false, eliminatedRound: null },
          });
        }
        if (match.player2Id) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: match.player2Id, eliminatedRound: match.round },
            data: { eliminated: false, eliminatedRound: null },
          });
        }

        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'resetMatch',
          matchId: resetMatchId,
          details: { round: match.round, matchIndex: match.matchIndex, bracket: match.bracket },
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true, message: 'Match reset (cascade cleanup applied)' });
      }

      
      case 'banPlayer': {
        const { userId: banUserId, reason: banReason, permanent, durationDays } = body;
        if (!banUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        const expiresAt = permanent ? null : new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000);

        const user = await prisma.user.findUnique({ where: { id: banUserId }, select: { username: true } });

        await prisma.userBan.create({
          data: {
            userId: banUserId,
            username: user?.username ?? 'Unknown',
            type: 'tournament',
            permanent: permanent ?? false,
            expiresAt,
            reason: banReason ?? '',
            issuedBy: session.user.id,
          },
        });

        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'banPlayer',
          targetUserId: banUserId,
          targetUsername: user?.username,
          details: { permanent: permanent ?? false, durationDays: durationDays ?? 7, reason: banReason ?? null },
        });
        return NextResponse.json({ success: true, message: `Player banned from tournaments${permanent ? ' (permanent)' : ` for ${durationDays || 7} days`}` });
      }

      
      case 'unbanPlayer': {
        const { userId: unbanUserId } = body;
        if (!unbanUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        await prisma.userBan.deleteMany({
          where: { userId: unbanUserId, type: 'tournament' },
        });

        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'unbanPlayer',
          targetUserId: unbanUserId,
        });
        return NextResponse.json({ success: true, message: 'Tournament ban removed' });
      }

      
      case 'cancelTournament': {
        if (tournament.status === 'completed') {
          return NextResponse.json({ error: 'Cannot cancel completed tournament' }, { status: 400 });
        }
        if (tournament.status === 'cancelled') {
          return NextResponse.json({ error: 'Tournament already cancelled' }, { status: 400 });
        }

        const inProgressMatches = tournament.matches.filter((m) => m.status === 'in_progress' && m.roomCode);
        const matchesWithTimer = tournament.matches.filter((m) => m.absenceDeadline !== null);
        const { rooms } = await import('@/lib/socket/server');
        const { clearAbsenceTimer } = await import('@/lib/tournament/absenceManager');
        const io = getSocketIO();

        for (const m of matchesWithTimer) {
          clearAbsenceTimer(m.id);
        }

        for (const m of inProgressMatches) {
          if (m.roomCode && rooms.has(m.roomCode)) {
            const room = rooms.get(m.roomCode)!;
            room.finalized = true;
            if (room.tournamentJoinTimer) { clearTimeout(room.tournamentJoinTimer); room.tournamentJoinTimer = null; }
            if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }
            if (room.actionTimer) { clearTimeout(room.actionTimer); room.actionTimer = null; }
            if (room.mulliganTimer) { clearTimeout(room.mulliganTimer); room.mulliganTimer = null; }
            if (io) io.to(m.roomCode).emit('tournament:cancelled', { reason: 'admin', tournamentId });
            setTimeout(() => {
              const r = rooms.get(m.roomCode!);
              if (r) rooms.delete(m.roomCode!);
            }, 10_000);
          }
          await prisma.tournamentMatch.update({
            where: { id: m.id },
            data: { status: 'forfeit', completedAt: new Date(), absenceDeadline: null, absentPlayerId: null },
          });
        }

        await prisma.tournamentMatch.updateMany({
          where: { tournamentId, absenceDeadline: { not: null }, status: { in: ['ready', 'pending'] } },
          data: { absenceDeadline: null, absentPlayerId: null },
        });

        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'cancelled' },
        });
        if (io) io.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { reason: 'admin', tournamentId });

        try {
          const { cleanupTournamentMapsExternal } = await import('@/lib/socket/tournamentHandlers');
          await cleanupTournamentMapsExternal(tournamentId);
        } catch (err) {
          console.error('[Tournament] cleanupTournamentMapsExternal failed:', err);
        }

        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'cancelTournament',
          details: {
            in_progress_matches_cancelled: inProgressMatches.length,
            absence_timers_cleared: matchesWithTimer.length,
          },
        });
        return NextResponse.json({ success: true, message: 'Tournament cancelled (in-progress matches stopped)' });
      }

      
      case 'removeParticipant': {
        const { userId: removeUserId } = body;
        if (!removeUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (tournament.status !== 'registration') {
          return NextResponse.json({ error: 'Can only remove during registration' }, { status: 400 });
        }
        const removedUser = await prisma.user.findUnique({ where: { id: removeUserId }, select: { username: true } });
        await prisma.tournamentParticipant.deleteMany({
          where: { tournamentId, userId: removeUserId },
        });
        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'removeParticipant',
          targetUserId: removeUserId,
          targetUsername: removedUser?.username,
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true, message: 'Participant removed' });
      }

      
      case 'updateNote': {
        const { note } = body;
        if (note != null && typeof note !== 'string') {
          return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 });
        }
        if (typeof note === 'string' && note.length > 500) {
          return NextResponse.json({ error: 'Note must be at most 500 characters' }, { status: 400 });
        }
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { restrictionNote: note ?? null },
        });
        await logAdminAction({
          tournamentId, actorId, actorUsername,
          action: 'updateNote',
          details: { length: typeof note === 'string' ? note.length : 0 },
        });
        await broadcastTournamentRefresh(tournamentId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
