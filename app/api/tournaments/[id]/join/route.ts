import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getPlayerLeague } from '@/lib/tournament/leagueUtils';

// POST — join a tournament
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const tournament = await prisma.tournament.findUnique({
      where: { id },
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

    // Private tournament — verify code
    if (!tournament.isPublic && tournament.joinCode) {
      if (body.joinCode !== tournament.joinCode) {
        return NextResponse.json({ error: 'Invalid join code' }, { status: 403 });
      }
    }

    // Load user for subsequent checks
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, discordId: true, elo: true },
    });

    // Simulator tournaments require Discord link
    if (tournament.requiresDiscord) {
      if (!user?.discordId) {
        return NextResponse.json({ error: 'Discord account required for simulator tournaments' }, { status: 400 });
      }
    }

    // League restriction check (simulator tournaments only)
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

    // Check not already joined
    const existing = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Already joined' }, { status: 400 });
    }

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId: id,
        userId: session.user.id,
        username: user?.username || 'Unknown',
      },
    });

    return NextResponse.json({ participant }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
