import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getPlayerLeague } from '@/lib/tournament/leagueUtils';


export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { joinCode: code.toUpperCase().trim() },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Registration is closed' }, { status: 400 });
    }
    if (tournament._count.participants >= tournament.maxPlayers) {
      return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, elo: true, discordId: true },
    });

    if (
      tournament.type === 'simulator' &&
      Array.isArray(tournament.allowedLeagues) &&
      tournament.allowedLeagues.length > 0
    ) {
      const playerLeague = getPlayerLeague(user?.elo ?? 0);
      if (!tournament.allowedLeagues.includes(playerLeague)) {
        return NextResponse.json({ error: 'Your current rank does not meet the requirements for this tournament' }, { status: 403 });
      }
    }

    if (tournament.requiresDiscord && !user?.discordId) {
      return NextResponse.json({ error: 'Link your Discord account first' }, { status: 403 });
    }

    const activeBan = await prisma.userBan.findFirst({
      where: {
        userId: session.user.id,
        type: 'tournament',
        OR: [
          { permanent: true },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (activeBan) {
      return NextResponse.json({ error: 'You are banned from tournaments' }, { status: 403 });
    }

    const existing = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: tournament.id,
          userId: session.user.id,
        },
      },
    });
    if (existing) {
      return NextResponse.json({ error: 'Already joined' }, { status: 400 });
    }

    try {
      const participant = await prisma.tournamentParticipant.create({
        data: {
          tournamentId: tournament.id,
          userId: session.user.id,
          username: user?.username || 'Unknown',
        },
      });
      const newCount = await prisma.tournamentParticipant.count({
        where: { tournamentId: tournament.id },
      });
      if (newCount > tournament.maxPlayers) {
        await prisma.tournamentParticipant.delete({ where: { id: participant.id } }).catch(() => {});
        return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
      }
      return NextResponse.json({
        participant,
        tournamentId: tournament.id,
      }, { status: 201 });
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : '';
      if (msg.includes('Unique constraint') || msg.includes('duplicate key')) {
        return NextResponse.json({ error: 'Already joined' }, { status: 409 });
      }
      throw createErr;
    }
  } catch (err) {
    console.error('[API] POST /api/tournaments/join-by-code error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
