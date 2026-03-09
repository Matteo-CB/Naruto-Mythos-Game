import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}

// POST — set manual pairings (admin only, simulator tournaments)
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
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.type !== 'simulator') {
      return NextResponse.json({ error: 'Manual pairings only for simulator tournaments' }, { status: 400 });
    }

    const isCreator = tournament.creatorId === session.user.id;
    if (!isCreator && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Can only set pairings before start' }, { status: 400 });
    }

    const body = await req.json();
    const { orderedPlayerIds } = body;

    if (!Array.isArray(orderedPlayerIds)) {
      return NextResponse.json({ error: 'orderedPlayerIds array required' }, { status: 400 });
    }

    // Update seeds according to the manual ordering
    for (let i = 0; i < orderedPlayerIds.length; i++) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId: id, userId: orderedPlayerIds[i] },
        data: { seed: i + 1 },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
