import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const reportId = typeof body?.reportId === 'string' ? body.reportId : '';
  if (!reportId) return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });

  const report = await prisma.playerReport.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (report.status !== 'pending') {
    return NextResponse.json({ error: 'Report already handled' }, { status: 409 });
  }

  await prisma.playerReport.update({
    where: { id: reportId },
    data: { status: 'dismissed', resolvedBy: admin.userId, resolvedAt: new Date() },
  });

  await prisma.adminAction.create({
    data: {
      actorId: admin.userId,
      actorName: admin.username,
      action: 'moderation.report.dismissed',
      targetId: report.targetId,
      payload: { reportId },
    },
  });

  return NextResponse.json({ ok: true });
}
