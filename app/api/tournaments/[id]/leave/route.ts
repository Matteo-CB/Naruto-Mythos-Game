import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST — leave a tournament (only during registration)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Cannot leave after tournament started' }, { status: 400 });
    }

    // Cannot leave own tournament as creator
    if (tournament.creatorId === session.user.id) {
      return NextResponse.json({ error: 'Creator cannot leave. Cancel the tournament instead.' }, { status: 400 });
    }

    await prisma.tournamentParticipant.deleteMany({
      where: { tournamentId: id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
