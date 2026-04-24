import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { assignTournamentWinnerRole, removeTournamentRole } from '@/lib/discord/tournamentRoles';
import { advanceMatchWinner } from '@/lib/socket/tournamentHandlers';

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

    switch (action) {
      
      case 'disqualify': {
        const { userId, reason } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId },
          data: { eliminated: true, eliminatedRound: tournament.currentRound || 0 },
        });

        
        const activeMatch = tournament.matches.find(
          m => (m.player1Id === userId || m.player2Id === userId)
            && (m.status === 'ready' || m.status === 'in_progress' || m.status === 'pending'),
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
          
          if (winnerId) {
            await advanceMatchWinner(null, tournamentId, activeMatch, winnerId, winnerUsername);
          }
        }

        return NextResponse.json({ success: true, message: `Player disqualified${reason ? ': ' + reason : ''}` });
      }

      
      case 'setMatchWinner': {
        const { matchId, winnerId } = body;
        if (!matchId || !winnerId) return NextResponse.json({ error: 'matchId and winnerId required' }, { status: 400 });

        const match = tournament.matches.find(m => m.id === matchId);
        if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

        const winnerUsername = match.player1Id === winnerId ? match.player1Username : match.player2Username;
        const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;
        const previousWinnerId = match.winnerId;

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

        
        await advanceMatchWinner(null, tournamentId, match, winnerId, winnerUsername);

        return NextResponse.json({ success: true, message: `Match winner set to ${winnerUsername}` });
      }

      
      case 'resetMatch': {
        const { matchId: resetMatchId } = body;
        if (!resetMatchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

        const match = tournament.matches.find(m => m.id === resetMatchId);
        if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

        
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

        return NextResponse.json({ success: true, message: 'Match reset' });
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

        return NextResponse.json({ success: true, message: `Player banned from tournaments${permanent ? ' (permanent)' : ` for ${durationDays || 7} days`}` });
      }

      
      case 'unbanPlayer': {
        const { userId: unbanUserId } = body;
        if (!unbanUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        await prisma.userBan.deleteMany({
          where: { userId: unbanUserId, type: 'tournament' },
        });

        return NextResponse.json({ success: true, message: 'Tournament ban removed' });
      }

      
      case 'cancelTournament': {
        if (tournament.status === 'completed') {
          return NextResponse.json({ error: 'Cannot cancel completed tournament' }, { status: 400 });
        }
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'cancelled' },
        });
        return NextResponse.json({ success: true, message: 'Tournament cancelled' });
      }

      
      case 'removeParticipant': {
        const { userId: removeUserId } = body;
        if (!removeUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (tournament.status !== 'registration') {
          return NextResponse.json({ error: 'Can only remove during registration' }, { status: 400 });
        }
        await prisma.tournamentParticipant.deleteMany({
          where: { tournamentId, userId: removeUserId },
        });
        return NextResponse.json({ success: true, message: 'Participant removed' });
      }

      
      case 'updateNote': {
        const { note } = body;
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { restrictionNote: note ?? null },
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
