import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { REPORT_REASON_MIN, REPORT_REASON_MAX, REPORTS_PER_DAY_LIMIT } from '@/lib/chat/constants';

const VALID_CONTEXTS = new Set(['game_chat', 'dm', 'profile']);

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const reporterId = session.user.id;

    const body = await request.json();
    const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const context = typeof body?.context === 'string' && VALID_CONTEXTS.has(body.context) ? body.context : 'game_chat';
    const roomCode = typeof body?.roomCode === 'string' ? body.roomCode.slice(0, 12) : null;
    const attachedMessage = typeof body?.attachedMessage === 'string' ? body.attachedMessage.slice(0, 300) : null;
    const attachedMessageAt = typeof body?.attachedMessageAt === 'number' ? new Date(body.attachedMessageAt) : null;

    if (!targetId || targetId === reporterId) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }
    if (reason.length < REPORT_REASON_MIN) {
      return NextResponse.json({ error: 'Reason too short', errorKey: 'report.reasonTooShort' }, { status: 400 });
    }
    if (reason.length > REPORT_REASON_MAX) {
      return NextResponse.json({ error: 'Reason too long', errorKey: 'report.reasonTooLong' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, username: true } });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.playerReport.count({
      where: { reporterId, createdAt: { gt: dayAgo } },
    });
    if (recentCount >= REPORTS_PER_DAY_LIMIT) {
      return NextResponse.json({ error: 'Report limit reached', errorKey: 'report.quotaReached' }, { status: 429 });
    }

    const alreadyPending = await prisma.playerReport.findFirst({
      where: { reporterId, targetId, status: 'pending' },
      select: { id: true },
    });
    if (alreadyPending) {
      return NextResponse.json({ error: 'Already reported', errorKey: 'report.alreadyReported' }, { status: 409 });
    }

    const reporter = await prisma.user.findUnique({ where: { id: reporterId }, select: { username: true } });

    const report = await prisma.playerReport.create({
      data: {
        reporterId,
        reporterName: reporter?.username ?? '???',
        targetId,
        targetName: target.username,
        reason,
        context,
        roomCode,
        attachedMessage,
        attachedMessageAt,
      },
    });

    return NextResponse.json({ reportId: report.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
