import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, targetId, targetName, messageText, roomCode, reason } = body;

    if (!messageId || !targetId || !targetName || !messageText || !roomCode) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Prevent self-reporting
    if (targetId === session.user.id) {
      return NextResponse.json({ error: 'Cannot report yourself' }, { status: 400 });
    }

    // Check for duplicate report
    const existing = await prisma.chatReport.findFirst({
      where: {
        messageId,
        reporterId: session.user.id,
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already reported' }, { status: 409 });
    }

    const report = await prisma.chatReport.create({
      data: {
        messageId,
        reporterId: session.user.id,
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
