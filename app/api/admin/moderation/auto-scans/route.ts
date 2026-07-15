import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const scans = await prisma.chatModerationScan.findMany({
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
      createdAt: true,
    },
  });

  return NextResponse.json({ scans });
}
