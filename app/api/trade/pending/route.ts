import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const rooms = await prisma.tradeRoom.findMany({
    where: { guestId: userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, creatorId: true },
  });
  if (rooms.length === 0) {
    return NextResponse.json({ invites: [] });
  }

  const creators = await prisma.user.findMany({
    where: { id: { in: rooms.map((r) => r.creatorId) } },
    select: { id: true, username: true },
  });
  const nameById = new Map(creators.map((c) => [c.id, c.username]));

  const invites = rooms.map((r) => ({
    roomId: r.id,
    fromUsername: nameById.get(r.creatorId) ?? '',
  }));

  return NextResponse.json({ invites });
}
