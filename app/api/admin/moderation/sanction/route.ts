import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';
import { applySanction, isValidSanctionDuration, type SanctionType, SANCTION_DURATIONS } from '@/lib/moderation/sanctions';
import { notifyUser } from '@/lib/moderation/notify';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';

const NOTIFIABLE_STATEFUL: ReadonlySet<string> = new Set(['mute_chat', 'ranked_ban', 'suspension', 'spectate_ban']);

export async function POST(request: NextRequest) {
  const admin = await requireModerator();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const type = typeof body?.type === 'string' ? (body.type as SanctionType) : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const durationMs = body?.durationMs === null || body?.durationMs === undefined ? null : Number(body.durationMs);
  const reportId = typeof body?.reportId === 'string' ? body.reportId : null;

  if (!userId || !type || !(type in SANCTION_DURATIONS)) {
    return NextResponse.json({ error: 'Invalid sanction' }, { status: 400 });
  }
  if (type === 'message_delete') {
    return NextResponse.json({ error: 'Use the delete-message endpoint' }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Reason required' }, { status: 400 });
  }
  if (!isValidSanctionDuration(type, durationMs)) {
    return NextResponse.json({ error: 'Invalid duration for this sanction type' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const sanction = await applySanction({
    userId,
    username: target.username,
    type,
    reason,
    issuedBy: admin.userId,
    issuedByName: admin.username,
    durationMs,
    reportId,
  });

  if (type === 'warn' || type === 'warn_severe') {
    await notifyUser(userId, type, { reason });
  } else if (type === 'name_reset') {
    await notifyUser(userId, 'name_reset', { reason });
  } else if (NOTIFIABLE_STATEFUL.has(type)) {
    await notifyUser(userId, 'sanction_notice', {
      reason,
      sanctionType: type,
      untilTs: sanction.expiresAt ? sanction.expiresAt.getTime() : null,
    });
  }

  if (reportId) {
    const report = await prisma.playerReport.findUnique({ where: { id: reportId } });
    if (report && report.status === 'pending') {
      await prisma.playerReport.update({
        where: { id: reportId },
        data: { status: 'resolved', resolvedBy: admin.userId, resolvedAt: new Date(), sanctionId: sanction.id },
      });
      await notifyUser(report.reporterId, 'victim_notice', {});
    }
  }

  if (type === 'mute_chat' || type === 'shadow_mute' || type === 'suspension') {
    refreshChatLock(userId);
  }

  await prisma.adminAction.create({
    data: {
      actorId: admin.userId,
      actorName: admin.username,
      action: `moderation.sanction.${type}`,
      targetId: userId,
      payload: { reason, durationMs, reportId, sanctionId: sanction.id },
    },
  });

  return NextResponse.json({ sanctionId: sanction.id }, { status: 201 });
}
