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


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { isPublic: true, creatorId: true },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (!tournament.isPublic) {
      const session = await auth();
      const viewerId = session?.user?.id;
      const viewerIsAdmin = isAdmin(session);
      const isCreator = !!viewerId && tournament.creatorId === viewerId;
      let isParticipant = false;
      if (viewerId && !isCreator && !viewerIsAdmin) {
        const p = await prisma.tournamentParticipant.findFirst({
          where: { tournamentId: id, userId: viewerId },
          select: { id: true },
        });
        isParticipant = !!p;
      }
      if (!isCreator && !viewerIsAdmin && !isParticipant) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }
    }

    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: id },
      orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    });

    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
