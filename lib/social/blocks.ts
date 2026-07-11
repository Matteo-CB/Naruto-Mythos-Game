import { prisma } from '@/lib/db/prisma';

export async function isBlockedEither(userIdA: string, userIdB: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return block !== null;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { senderId: blockerId, receiverId: blockedId },
        { senderId: blockedId, receiverId: blockerId },
      ],
    },
  });
  await prisma.matchInvite.deleteMany({
    where: {
      status: 'pending',
      OR: [
        { senderId: blockerId, receiverId: blockedId },
        { senderId: blockedId, receiverId: blockerId },
      ],
    },
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function getBlockedList(blockerId: string) {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
  });
  if (blocks.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: blocks.map((b) => b.blockedId) } },
    select: { id: true, username: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.username]));
  return blocks.map((b) => ({
    userId: b.blockedId,
    username: nameById.get(b.blockedId) ?? '???',
    blockedAt: b.createdAt,
  }));
}
