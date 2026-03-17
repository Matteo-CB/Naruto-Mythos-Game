import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reports = await prisma.chatReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ reports });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (admin?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { reportId, action, duration, eloAmount, reporterReward } = body;

    if (!reportId || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const report = await prisma.chatReport.findUnique({ where: { id: reportId } });
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Apply action
    const now = new Date();
    let expiresAt: Date | null = null;
    if (duration) {
      const hours = parseInt(duration, 10);
      if (!isNaN(hours)) {
        expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
      }
    }

    switch (action) {
      case 'dismiss':
        break;
      case 'warn':
        break;
      case 'chatBanTemp':
        if (!expiresAt) return NextResponse.json({ error: 'Duration required' }, { status: 400 });
        await prisma.user.update({
          where: { id: report.targetId },
          data: { chatBanned: true, chatBanUntil: expiresAt },
        });
        await prisma.userBan.create({
          data: {
            userId: report.targetId,
            username: report.targetName,
            type: 'chatBan',
            permanent: false,
            expiresAt,
            reason: report.messageText,
            issuedBy: session.user.id,
          },
        });
        break;
      case 'chatBanPerm':
        await prisma.user.update({
          where: { id: report.targetId },
          data: { chatBanned: true, chatBanUntil: null },
        });
        await prisma.userBan.create({
          data: {
            userId: report.targetId,
            username: report.targetName,
            type: 'chatBan',
            permanent: true,
            reason: report.messageText,
            issuedBy: session.user.id,
          },
        });
        break;
      case 'gameBanTemp':
        if (!expiresAt) return NextResponse.json({ error: 'Duration required' }, { status: 400 });
        await prisma.user.update({
          where: { id: report.targetId },
          data: { gameBanned: true, gameBanUntil: expiresAt },
        });
        await prisma.userBan.create({
          data: {
            userId: report.targetId,
            username: report.targetName,
            type: 'gameBan',
            permanent: false,
            expiresAt,
            reason: report.messageText,
            issuedBy: session.user.id,
          },
        });
        break;
      case 'gameBanPerm':
        await prisma.user.update({
          where: { id: report.targetId },
          data: { gameBanned: true, gameBanUntil: null },
        });
        await prisma.userBan.create({
          data: {
            userId: report.targetId,
            username: report.targetName,
            type: 'gameBan',
            permanent: true,
            reason: report.messageText,
            issuedBy: session.user.id,
          },
        });
        break;
      case 'eloDeduct': {
        const amount = parseInt(eloAmount, 10);
        if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid ELO amount' }, { status: 400 });
        const target = await prisma.user.findUnique({ where: { id: report.targetId }, select: { elo: true } });
        if (target) {
          await prisma.user.update({
            where: { id: report.targetId },
            data: { elo: Math.max(100, target.elo - amount) },
          });
        }
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Reward reporter with ELO if specified
    const rewardAmount = reporterReward ? parseInt(reporterReward, 10) : 0;
    if (rewardAmount > 0 && action !== 'dismiss') {
      const reporter = await prisma.user.findUnique({ where: { id: report.reporterId }, select: { elo: true } });
      if (reporter) {
        await prisma.user.update({
          where: { id: report.reporterId },
          data: { elo: reporter.elo + rewardAmount },
        });
      }
    }

    // Mark report as resolved
    await prisma.chatReport.update({
      where: { id: reportId },
      data: {
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        resolvedAt: now,
        resolvedBy: session.user.id,
        action,
        reporterReward: rewardAmount > 0 ? rewardAmount : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Admin Reports] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
