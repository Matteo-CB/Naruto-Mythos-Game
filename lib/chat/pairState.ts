import { prisma } from '@/lib/db/prisma';
import { canChatTogether, normalizeChatVisibility, publicLockState, type ChatLockState } from './chatRules';

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends';

export interface PairChatState {
  lockState: ChatLockState;
  publicState: Exclude<ChatLockState, 'blocked'>;
  friendStatusForA: FriendStatus;
  friendStatusForB: FriendStatus;
  friendshipId: string | null;
}

const PAIR_CACHE_TTL_MS = 60 * 1000;
const pairCache = new Map<string, { at: number; state: PairChatState }>();

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function invalidatePairChatCache(userId?: string): void {
  if (!userId) {
    pairCache.clear();
    return;
  }
  for (const key of pairCache.keys()) {
    const [a, b] = key.split(':');
    if (a === userId || b === userId) pairCache.delete(key);
  }
}

export async function getPairChatState(userIdA: string, userIdB: string): Promise<PairChatState> {
  const key = pairKey(userIdA, userIdB);
  const cached = pairCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < PAIR_CACHE_TTL_MS) {
    return flipIfNeeded(cached.state, userIdA < userIdB);
  }

  const [first, second] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

  const [users, friendship, blocks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [first, second] } },
      select: { id: true, chatVisibility: true },
    }),
    prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: first, receiverId: second },
          { senderId: second, receiverId: first },
        ],
      },
      select: { id: true, senderId: true, status: true },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: first, blockedId: second },
          { blockerId: second, blockedId: first },
        ],
      },
      select: { blockerId: true },
    }),
  ]);

  const visFirst = normalizeChatVisibility(users.find((u) => u.id === first)?.chatVisibility);
  const visSecond = normalizeChatVisibility(users.find((u) => u.id === second)?.chatVisibility);
  const areFriends = friendship?.status === 'accepted';
  const firstBlockedSecond = blocks.some((b) => b.blockerId === first);
  const secondBlockedFirst = blocks.some((b) => b.blockerId === second);

  const lockState = canChatTogether({
    aVisibility: visFirst,
    bVisibility: visSecond,
    areFriends: areFriends === true,
    aBlockedB: firstBlockedSecond,
    bBlockedA: secondBlockedFirst,
  });

  let statusForFirst: FriendStatus = 'none';
  let statusForSecond: FriendStatus = 'none';
  if (friendship?.status === 'accepted') {
    statusForFirst = 'friends';
    statusForSecond = 'friends';
  } else if (friendship?.status === 'pending') {
    if (friendship.senderId === first) {
      statusForFirst = 'pending_out';
      statusForSecond = 'pending_in';
    } else {
      statusForFirst = 'pending_in';
      statusForSecond = 'pending_out';
    }
  }

  const canonical: PairChatState = {
    lockState,
    publicState: publicLockState(lockState),
    friendStatusForA: statusForFirst,
    friendStatusForB: statusForSecond,
    friendshipId: friendship?.status === 'pending' ? friendship.id : null,
  };
  pairCache.set(key, { at: now, state: canonical });
  return flipIfNeeded(canonical, userIdA === first);
}

function flipIfNeeded(canonical: PairChatState, aIsFirst: boolean): PairChatState {
  if (aIsFirst) return canonical;
  return {
    ...canonical,
    friendStatusForA: canonical.friendStatusForB,
    friendStatusForB: canonical.friendStatusForA,
  };
}
