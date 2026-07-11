import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { revokeSanction } from '@/lib/moderation/sanctions';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const sanctionId = typeof body?.sanctionId === 'string' ? body.sanctionId : '';
  if (!sanctionId) return NextResponse.json({ error: 'Missing sanctionId' }, { status: 400 });

  const sanction = await prisma.sanction.findUnique({ where: { id: sanctionId } });
  if (!sanction) return NextResponse.json({ error: 'Sanction not found' }, { status: 404 });
  if (sanction.revokedAt) return NextResponse.json({ error: 'Already revoked' }, { status: 409 });

  await revokeSanction(sanctionId);
  refreshChatLock(sanction.userId);

  await prisma.adminAction.create({
    data: {
      actorId: admin.userId,
      actorName: admin.username,
      action: 'moderation.sanction.revoked',
      targetId: sanction.userId,
      payload: { sanctionId, type: sanction.type },
    },
  });

  return NextResponse.json({ ok: true });
}
