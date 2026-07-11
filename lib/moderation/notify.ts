import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';
import type { NoticeKind, NoticePayload } from './noticeContent';

export async function notifyUser(userId: string, kind: NoticeKind, payload: NoticePayload): Promise<void> {
  const row = await prisma.playerNotification.create({
    data: { userId, kind, payload: payload as object },
  });
  emitToUser(userId, 'notify:popup', {
    id: row.id,
    kind,
    payload,
    createdAt: row.createdAt.getTime(),
  });
}
