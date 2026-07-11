import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const source = body?.source === 'dm' ? 'dm' : body?.source === 'game' ? 'game' : null;
  const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
  const reason = typeof body?.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : 'moderation';
  if (!source || !messageId) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  let authorId = '';
  let authorName = '';
  let text = '';

  if (source === 'game') {
    const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    authorId = msg.userId;
    authorName = msg.username;
    text = msg.message;
    await prisma.chatMessage.delete({ where: { id: messageId } });
  } else {
    const msg = await prisma.privateMessage.findUnique({ where: { id: messageId } });
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    authorId = msg.senderId;
    const author = await prisma.user.findUnique({ where: { id: authorId }, select: { username: true } });
    authorName = author?.username ?? '???';
    text = msg.body;
    await prisma.privateMessage.delete({ where: { id: messageId } });
  }

  await prisma.sanction.create({
    data: {
      userId: authorId,
      username: authorName,
      type: 'message_delete',
      reason: `${reason} :: ${text.slice(0, 200)}`,
      issuedBy: admin.userId,
      issuedByName: admin.username,
    },
  });

  await prisma.adminAction.create({
    data: {
      actorId: admin.userId,
      actorName: admin.username,
      action: 'moderation.message.deleted',
      targetId: authorId,
      payload: { source, messageId, text: text.slice(0, 200), reason },
    },
  });

  return NextResponse.json({ ok: true });
}
