import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getSocketIO } from '@/lib/socket/server';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { seed: 'asc' },
          select: {
            id: true, userId: true, username: true,
            seed: true, eliminated: true, eliminatedRound: true, hasBye: true,
            deckId: true, deckValid: true,
          },
        },
        matches: {
          orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        },
      },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const session = await auth();
    const viewerId = session?.user?.id;
    const viewerIsAdmin = isAdmin(session);
    const isCreator = !!viewerId && tournament.creatorId === viewerId;
    const isParticipant = !!viewerId && tournament.participants.some(p => p.userId === viewerId);

    if (!tournament.isPublic && !isCreator && !viewerIsAdmin && !isParticipant) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const safe = (isCreator || viewerIsAdmin)
      ? tournament
      : { ...tournament, joinCode: null };

    return NextResponse.json({ tournament: safe });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


export async function DELETE(
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

    const isCreator = tournament.creatorId === session.user.id;
    if (!isCreator && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (tournament.status === 'in_progress') {
      return NextResponse.json({
        error: 'Cannot delete an in-progress tournament. Cancel it first.',
      }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } }),
      prisma.tournamentParticipant.deleteMany({ where: { tournamentId: id } }),
      prisma.tournamentAdminLog.deleteMany({ where: { tournamentId: id } }),
      prisma.tournament.delete({ where: { id } }),
    ]);

    const io = getSocketIO();
    if (io) io.to(`tournament:${id}`).emit('tournament:cancelled', { reason: 'deleted', tournamentId: id });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
