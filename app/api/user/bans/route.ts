import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ bans: [], notifications: [] });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        chatBanned: true,
        chatBanUntil: true,
        gameBanned: true,
        gameBanUntil: true,
      },
    });

    if (!user) return NextResponse.json({ bans: [], notifications: [] });

    const now = new Date();
    const bans: Array<{ type: string; permanent: boolean; expiresAt: string | null }> = [];

    // Check if bans have expired
    if (user.chatBanned) {
      if (user.chatBanUntil && user.chatBanUntil < now) {
        // Ban expired — clear it
        await prisma.user.update({
          where: { id: session.user.id },
          data: { chatBanned: false, chatBanUntil: null },
        });
      } else {
        bans.push({
          type: 'chat',
          permanent: !user.chatBanUntil,
          expiresAt: user.chatBanUntil?.toISOString() ?? null,
        });
      }
    }

    if (user.gameBanned) {
      if (user.gameBanUntil && user.gameBanUntil < now) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { gameBanned: false, gameBanUntil: null },
        });
      } else {
        bans.push({
          type: 'game',
          permanent: !user.gameBanUntil,
          expiresAt: user.gameBanUntil?.toISOString() ?? null,
        });
      }
    }

    // Check for unnotified resolved reports where this user was the reporter
    const resolvedReports = await prisma.chatReport.findMany({
      where: {
        reporterId: session.user.id,
        status: { in: ['resolved'] },
        reporterNotified: false,
      },
      select: {
        id: true,
        targetName: true,
        action: true,
        reporterReward: true,
      },
    });

    // Mark them as notified
    if (resolvedReports.length > 0) {
      await prisma.chatReport.updateMany({
        where: { id: { in: resolvedReports.map((r) => r.id) } },
        data: { reporterNotified: true },
      });
    }

    const notifications = resolvedReports.map((r) => ({
      targetName: r.targetName,
      action: r.action,
      reward: r.reporterReward,
    }));

    return NextResponse.json({ bans, notifications });
  } catch {
    return NextResponse.json({ bans: [], notifications: [] }, { status: 500 });
  }
}
