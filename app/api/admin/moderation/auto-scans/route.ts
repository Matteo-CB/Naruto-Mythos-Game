import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam === 'handled' ? 'handled' : statusParam === 'all' ? 'all' : 'pending';

  const where = status === 'all'
    ? {}
    : status === 'handled'
      ? { status: 'handled' }
      : { OR: [{ status: 'pending' }, { status: { isSet: false } }] };

  const scans = await prisma.chatModerationScan.findMany({
    where: where as never,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      messageId: true,
      roomCode: true,
      userId: true,
      username: true,
      message: true,
      topCategory: true,
      topScore: true,
      action: true,
      status: true,
      handledByName: true,
      handledAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ scans });
}
