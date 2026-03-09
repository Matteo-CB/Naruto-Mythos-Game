import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}

// POST — force-forfeit a player in a match
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

    // Determine winner (the player who did NOT forfeit)
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

    // Mark forfeited player as eliminated
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId: id, userId: forfeitPlayerId },
      data: { eliminated: true, eliminatedRound: match.round },
    });

    // Advance winner to next round
    if (winnerId && winnerUsername) {
      const nextRound = match.round + 1;
      const nextMatchIndex = Math.floor(match.matchIndex / 2);
      const isTopSlot = match.matchIndex % 2 === 0;

      const nextMatch = await prisma.tournamentMatch.findUnique({
        where: {
          tournamentId_round_matchIndex: {
            tournamentId: id,
            round: nextRound,
            matchIndex: nextMatchIndex,
          },
        },
      });

      if (nextMatch) {
        const updateData: Record<string, unknown> = {};
        if (isTopSlot) {
          updateData.player1Id = winnerId;
          updateData.player1Username = winnerUsername;
        } else {
          updateData.player2Id = winnerId;
          updateData.player2Username = winnerUsername;
        }

        const updated = await prisma.tournamentMatch.update({
          where: { id: nextMatch.id },
          data: updateData,
        });

        // If both players are now set, mark as ready
        const p1 = isTopSlot ? winnerId : updated.player1Id;
        const p2 = isTopSlot ? updated.player2Id : winnerId;
        if (p1 && p2) {
          await prisma.tournamentMatch.update({
            where: { id: nextMatch.id },
            data: { status: 'ready' },
          });
        }
      } else {
        // No next match = this was the final — tournament complete
        await prisma.tournament.update({
          where: { id },
          data: {
            status: 'completed',
            winnerId,
            winnerUsername,
            completedAt: new Date(),
          },
        });

        await prisma.user.update({
          where: { id: winnerId },
          data: { tournamentWins: { increment: 1 } },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
