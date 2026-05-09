import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const reportRate = new Map<string, number[]>();
const REPORT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_MAX = 10;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const now = Date.now();
    const windowStart = now - REPORT_WINDOW_MS;
    const recent = (reportRate.get(userId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= REPORT_MAX) {
      return NextResponse.json(
        { error: 'Too many reports, please wait before reporting again' },
        { status: 429 },
      );
    }
    recent.push(now);
    reportRate.set(userId, recent);
    if (reportRate.size > 5000) {
      for (const [k, ts] of reportRate) {
        if (ts.length === 0 || ts[ts.length - 1] < windowStart) reportRate.delete(k);
      }
    }

    const body = await request.json();
    const { messageId, targetId, targetName, messageText, roomCode, reason } = body;

    if (!messageId || !targetId || !targetName || !messageText || !roomCode) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (
      typeof messageId !== 'string' || messageId.length > 80 ||
      typeof targetId !== 'string' || targetId.length > 80 ||
      typeof targetName !== 'string' || targetName.length > 50 ||
      typeof messageText !== 'string' || messageText.length > 500 ||
      typeof roomCode !== 'string' || roomCode.length > 20 ||
      (reason !== undefined && (typeof reason !== 'string' || reason.length > 500))
    ) {
      return NextResponse.json({ error: 'Invalid field types or sizes' }, { status: 400 });
    }

    if (targetId === userId) {
      return NextResponse.json({ error: 'Cannot report yourself' }, { status: 400 });
    }

    const existing = await prisma.chatReport.findFirst({
      where: {
        messageId,
        reporterId: userId,
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already reported' }, { status: 409 });
    }

    const report = await prisma.chatReport.create({
      data: {
        messageId,
        reporterId: userId,
        reporterName: session.user.name ?? 'Unknown',
        targetId,
        targetName,
        messageText,
        roomCode,
        reason: reason ?? '',
      },
    });

    return NextResponse.json({ id: report.id });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
