import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';

export async function GET(request: NextRequest) {
  const admin = await requireModerator();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam && ['pending', 'resolved', 'dismissed'].includes(statusParam) ? statusParam : 'pending';

  const reports = await prisma.playerReport.findMany({
    where: { status },
    orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
    take: 100,
  });
  return NextResponse.json({ reports });
}
