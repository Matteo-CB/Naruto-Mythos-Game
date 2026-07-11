import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getUnreadDmCount } from '@/lib/dm/dmService';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const [unreadDms, pendingRequests] = await Promise.all([
    getUnreadDmCount(userId),
    prisma.friendship.count({ where: { receiverId: userId, status: 'pending' } }),
  ]);
  return NextResponse.json({ unreadDms, pendingRequests, total: unreadDms + pendingRequests });
}
