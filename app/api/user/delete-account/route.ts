import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const DELETE_PHRASE = 'DELETE MY ACCOUNT';

const deleteRate = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 3;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', errorKey: 'auth.error.notAuthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const recent = (deleteRate.get(userId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= RATE_MAX) {
    return NextResponse.json(
      { error: 'Too many delete attempts, please wait', errorKey: 'settings.deleteAccount.error.rateLimit' },
      { status: 429 },
    );
  }
  recent.push(now);
  deleteRate.set(userId, recent);
  if (deleteRate.size > 5000) {
    for (const [k, ts] of deleteRate) {
      if (ts.length === 0 || ts[ts.length - 1] < windowStart) deleteRate.delete(k);
    }
  }

  let body: { confirmation?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body */ }
  const confirmation = typeof body.confirmation === 'string' ? body.confirmation.trim() : '';
  if (confirmation !== DELETE_PHRASE) {
    return NextResponse.json(
      { error: 'Confirmation phrase mismatch', errorKey: 'settings.deleteAccount.error.phraseMismatch' },
      { status: 400 },
    );
  }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!me) {
    return NextResponse.json({ error: 'Account not found', errorKey: 'settings.deleteAccount.error.notFound' }, { status: 404 });
  }
  if (me.role === 'admin') {
    return NextResponse.json(
      { error: 'Admin accounts cannot be self-deleted', errorKey: 'settings.deleteAccount.error.adminBlocked' },
      { status: 403 },
    );
  }

  try {
    await Promise.all([
      prisma.deck.deleteMany({ where: { userId } }),
      prisma.deckStats.deleteMany({ where: { userId } }).catch(() => ({ count: 0 })),
      prisma.eloHistory.deleteMany({ where: { OR: [{ userId }, { opponentId: userId }] } }).catch(() => ({ count: 0 })),
      prisma.friendship.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
      prisma.matchInvite.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
      prisma.quizScore.deleteMany({ where: { userId } }),
      prisma.userBan.deleteMany({ where: { userId } }),
      prisma.chatReport.deleteMany({ where: { OR: [{ reporterId: userId }, { targetId: userId }] } }),
      prisma.chatMessage.deleteMany({ where: { userId } }),
      prisma.tournamentParticipant.deleteMany({ where: { userId } }),
      prisma.tournamentAdminLog.deleteMany({ where: { OR: [{ actorId: userId }, { targetUserId: userId }] } }).catch(() => ({ count: 0 })),
      prisma.room.deleteMany({ where: { OR: [{ hostId: userId }, { guestId: userId }] } }),
      prisma.account.deleteMany({ where: { userId } }),
    ]);

    await Promise.all([
      prisma.game.updateMany({ where: { player1Id: userId }, data: { player1Id: null } }),
      prisma.game.updateMany({ where: { player2Id: userId }, data: { player2Id: null } }),
      prisma.game.updateMany({ where: { winnerId: userId }, data: { winnerId: null } }),
      prisma.tournamentMatch.updateMany({ where: { player1Id: userId }, data: { player1Id: null } }),
      prisma.tournamentMatch.updateMany({ where: { player2Id: userId }, data: { player2Id: null } }),
      prisma.tournamentMatch.updateMany({ where: { winnerId: userId }, data: { winnerId: null } }),
    ]);

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API] /api/user/delete-account error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Account deletion failed', errorKey: 'settings.deleteAccount.error.serverError' },
      { status: 500 },
    );
  }
}
