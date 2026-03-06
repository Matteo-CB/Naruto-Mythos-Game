import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST — join a tournament by code
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

    // Simulator tournaments require Discord
    if (tournament.requiresDiscord) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { discordId: true },
      });
      if (!user?.discordId) {
        return NextResponse.json({ error: 'Discord account required' }, { status: 400 });
      }
    }

    // Check not already joined
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true },
    });

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        userId: session.user.id,
        username: user?.username || 'Unknown',
      },
    });

    return NextResponse.json({
      participant,
      tournamentId: tournament.id,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
