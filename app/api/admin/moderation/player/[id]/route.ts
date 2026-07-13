import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireModerator();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, elo: true, createdAt: true, chatVisibility: true, usernameResetRequired: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [sanctions, reportsReceived, reportsFiled, gameMessages, dmMessages] = await Promise.all([
    prisma.sanction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.playerReport.findMany({ where: { targetId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.playerReport.findMany({ where: { reporterId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.chatMessage.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.privateMessage.findMany({ where: { senderId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  const messages = [
    ...gameMessages.map((m) => ({ id: m.id, source: 'game' as const, text: m.message, roomCode: m.roomCode, createdAt: m.createdAt.getTime() })),
    ...dmMessages.map((m) => ({ id: m.id, source: 'dm' as const, text: m.body, roomCode: null, createdAt: m.createdAt.getTime() })),
  ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);

  return NextResponse.json({
    user,
    sanctions: sanctions.map((sc) => ({
      id: sc.id, type: sc.type, reason: sc.reason, issuedByName: sc.issuedByName,
      expiresAt: sc.expiresAt?.getTime() ?? null, revokedAt: sc.revokedAt?.getTime() ?? null,
      createdAt: sc.createdAt.getTime(), reportId: sc.reportId,
    })),
    reportsReceived,
    reportsFiled,
    messages,
  });
}
