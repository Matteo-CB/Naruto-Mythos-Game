import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20));

  const logs = await prisma.tradeLog.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { executedAt: 'desc' },
    take: limit,
  });

  const partnerIds = [...new Set(logs.map((l) => (l.senderId === userId ? l.receiverId : l.senderId)))];
  const partners = await prisma.user.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, username: true },
  });
  const nameById = new Map(partners.map((p) => [p.id, p.username]));

  const trades = logs.map((log) => {
    const isSender = log.senderId === userId;
    const partnerId = isSender ? log.receiverId : log.senderId;
    return {
      id: log.id,
      executedAt: log.executedAt,
      gaveCards: isSender ? log.senderCards : log.receiverCards,
      receivedCards: isSender ? log.receiverCards : log.senderCards,
      partnerId,
      partnerUsername: nameById.get(partnerId) ?? '',
    };
  });

  return NextResponse.json({ trades });
}
