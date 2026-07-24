import { prisma } from '@/lib/db/prisma';

export async function reportPost(reporterId: string, reporterName: string, postId: string, reason: string | null): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, body: true } });
  if (!post) return false;
  if (post.authorId === reporterId) return false;

  const already = await prisma.postReport.findFirst({
    where: { targetType: 'post', postId, reporterId, status: 'pending' },
    select: { id: true },
  });
  if (already) return true;

  const author = await prisma.user.findUnique({ where: { id: post.authorId }, select: { username: true } });
  await prisma.postReport.create({
    data: {
      targetType: 'post',
      postId,
      reporterId,
      reporterName,
      authorId: post.authorId,
      authorName: author?.username ?? '?',
      content: post.body.slice(0, 500),
      reason: reason ? reason.slice(0, 300) : null,
    },
  });
  return true;
}

export async function reportDmMessage(reporterId: string, reporterName: string, messageId: string, reason: string | null): Promise<boolean> {
  const msg = await prisma.privateMessage.findUnique({ where: { id: messageId }, select: { id: true, senderId: true, receiverId: true, body: true } });
  if (!msg) return false;
  if (msg.receiverId !== reporterId && msg.senderId !== reporterId) return false;
  if (msg.senderId === reporterId) return false;

  const already = await prisma.postReport.findFirst({
    where: { targetType: 'message', messageId, reporterId, status: 'pending' },
    select: { id: true },
  });
  if (already) return true;

  const author = await prisma.user.findUnique({ where: { id: msg.senderId }, select: { username: true } });
  await prisma.postReport.create({
    data: {
      targetType: 'message',
      messageId,
      reporterId,
      reporterName,
      authorId: msg.senderId,
      authorName: author?.username ?? '?',
      content: msg.body.slice(0, 500),
      reason: reason ? reason.slice(0, 300) : null,
    },
  });
  return true;
}
