import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin as isAdminUser } from '@/lib/auth/admins';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, myParticipations, openTournamentCount, nextUpcoming] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
    prisma.tournamentParticipant.findMany({
      where: {
        userId,
        tournament: { status: { in: ['registration', 'in_progress'] } },
      },
      select: {
        deckValid: true,
        eliminated: true,
        tournament: {
          select: { id: true, status: true, gameMode: true },
        },
      },
    }),
    prisma.tournament.count({
      where: { status: 'registration', isPublic: true },
    }),
    prisma.tournament.findFirst({
      where: {
        status: 'registration',
        scheduledStartAt: { not: null, gt: new Date() },
        OR: [
          { isPublic: true },
          { participants: { some: { userId } } },
        ],
      },
      orderBy: { scheduledStartAt: 'asc' },
      select: { scheduledStartAt: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let tournamentStatus: 'none' | 'registration' | 'in_progress' = 'none';
  let tournamentNeedsDeck = false;
  const joinedTournamentIds = new Set<string>();
  for (const p of myParticipations) {
    joinedTournamentIds.add(p.tournament.id);
    if (p.eliminated) continue;
    if (p.tournament.status === 'registration') {
      tournamentStatus = 'registration';
      if (!p.deckValid && p.tournament.gameMode !== 'sealed') {
        tournamentNeedsDeck = true;
      }
    } else if (p.tournament.status === 'in_progress' && tournamentStatus !== 'registration') {
      tournamentStatus = 'in_progress';
    }
  }

  const tournamentAvailable = tournamentStatus === 'none' && openTournamentCount > 0;

  const isAdmin = isAdminUser({ username: session.user.name, email: session.user.email });
  const isTester = user.role === 'tester';
  const isOrganizer = user.role === 'tournament_organizer';

  return NextResponse.json({
    role: user.role,
    isAdmin,
    isTester,
    isOrganizer,
    canSeeUnrevealed: isAdmin || isTester,
    canCreateTournaments: isAdmin || isOrganizer,
    tournamentStatus,
    tournamentNeedsDeck,
    tournamentAvailable,
    openTournamentCount,
    nextTournamentStartAt: nextUpcoming?.scheduledStartAt?.toISOString() ?? null,
  });
}
