import { prisma } from '@/lib/db/prisma';

// Follow coexists with the friend request/accept system, kept in sync so that
// "friends" always equals "mutual follow":
//  - following someone who already follows you auto-creates the accepted friendship,
//  - becoming friends (accept) ensures both follows exist,
//  - unfollowing breaks the mutual link and therefore the friendship.

export async function ensureMutualFollowForFriends(a: string, b: string): Promise<void> {
  if (a === b) return;
  await Promise.all([
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: a, followingId: b } },
      update: {},
      create: { followerId: a, followingId: b },
    }),
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: b, followingId: a } },
      update: {},
      create: { followerId: b, followingId: a },
    }),
  ]);
}

export async function followUser(followerId: string, targetId: string): Promise<{ following: boolean; nowFriends: boolean }> {
  if (followerId === targetId) return { following: false, nowFriends: false };
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId: targetId } },
    update: {},
    create: { followerId, followingId: targetId },
  });

  const reverse = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: targetId, followingId: followerId } },
    select: { id: true },
  });

  let nowFriends = false;
  if (reverse) {
    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ senderId: followerId, receiverId: targetId }, { senderId: targetId, receiverId: followerId }] },
      select: { id: true, status: true },
    });
    if (!existing) {
      await prisma.friendship.create({ data: { senderId: followerId, receiverId: targetId, status: 'accepted' } }).catch(() => {});
    } else if (existing.status !== 'accepted') {
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'accepted' } }).catch(() => {});
    }
    nowFriends = true;
  }
  return { following: true, nowFriends };
}

export async function unfollowUser(followerId: string, targetId: string): Promise<{ following: boolean }> {
  await prisma.follow.deleteMany({ where: { followerId, followingId: targetId } });
  await prisma.friendship.deleteMany({
    where: { OR: [{ senderId: followerId, receiverId: targetId }, { senderId: targetId, receiverId: followerId }] },
  });
  return { following: false };
}

export async function getFollowState(
  viewerId: string | null,
  targetId: string,
): Promise<{ following: boolean; followedBy: boolean; followerCount: number; followingCount: number }> {
  const [following, followedBy, followerCount, followingCount] = await Promise.all([
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetId } }, select: { id: true } })
      : Promise.resolve(null),
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: targetId, followingId: viewerId } }, select: { id: true } })
      : Promise.resolve(null),
    prisma.follow.count({ where: { followingId: targetId } }),
    prisma.follow.count({ where: { followerId: targetId } }),
  ]);
  return { following: following !== null, followedBy: followedBy !== null, followerCount, followingCount };
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  return rows.map((r) => r.followingId);
}
