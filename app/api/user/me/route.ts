import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, myParticipations, openTournamentCount] = await Promise.all([
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

  return NextResponse.json({
    role: user.role,
    tournamentStatus,
    tournamentNeedsDeck,
    tournamentAvailable,
    openTournamentCount,
  });
}
