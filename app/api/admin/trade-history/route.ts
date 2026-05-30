import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, email: true } });
  return isAdmin({ username: u?.username, email: u?.email });
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const username = (searchParams.get('username') ?? '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100));

  let userFilterId: string | null = null;
  if (username) {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ trades: [] });
    }
    userFilterId = user.id;
  }

  const where = userFilterId
    ? { OR: [{ senderId: userFilterId }, { receiverId: userFilterId }] }
    : {};

  const logs = await prisma.tradeLog.findMany({
    where,
    orderBy: { executedAt: 'desc' },
    take: limit,
  });

  const ids = [...new Set(logs.flatMap((l) => [l.senderId, l.receiverId]))];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.username]));

  const trades = logs.map((log) => ({
    id: log.id,
    tradeRoomId: log.tradeRoomId,
    executedAt: log.executedAt,
    senderId: log.senderId,
    senderUsername: nameById.get(log.senderId) ?? '',
    receiverId: log.receiverId,
    receiverUsername: nameById.get(log.receiverId) ?? '',
    senderCards: log.senderCards,
    receiverCards: log.receiverCards,
    isAdminSim: log.tradeRoomId === 'admin-sim',
  }));

  return NextResponse.json({ trades });
}
