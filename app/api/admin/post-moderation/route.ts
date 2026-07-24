import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';
import { deletePost } from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const [reports, scans] = await Promise.all([
      prisma.postReport.findMany({ where: { status: { not: 'handled' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.chatModerationScan.findMany({
        where: { roomCode: 'post', status: { not: 'handled' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, userId: true, username: true, message: true, topCategory: true, topScore: true, action: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({ reports, scans });
  } catch (e) {
    console.error('[post-moderation] query failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'resolveReport' && typeof body.reportId === 'string') {
    await prisma.postReport.update({ where: { id: body.reportId }, data: { status: 'handled', handledByName: mod.username, handledAt: new Date() } }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  if (action === 'resolveScan' && typeof body.scanId === 'string') {
    await prisma.chatModerationScan.update({ where: { id: body.scanId }, data: { status: 'handled', handledByName: mod.username, handledAt: new Date() } }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  if (action === 'deletePost' && typeof body.postId === 'string') {
    await deletePost(mod.userId, body.postId, true);
    await prisma.postReport.updateMany({ where: { postId: body.postId }, data: { status: 'handled', handledByName: mod.username, handledAt: new Date() } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
