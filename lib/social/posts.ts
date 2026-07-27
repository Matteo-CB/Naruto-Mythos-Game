import { prisma } from '@/lib/db/prisma';
import { holdScanMessage } from '@/lib/moderation/autoScan';
import { getFollowingIds } from '@/lib/social/followSync';
import { getHiddenAuthorIds, canViewerSeePostsOf } from '@/lib/social/privacy';
import { getHiddenCardIds, isCardPublicSync } from '@/lib/cards/reveal';
import { getCardById } from '@/lib/data/cardIndex';
import { holoBaseId } from '@/lib/holo/holoId';
import type { DeckSnapshot, ReplaySnapshot, PostView, FeedFilter } from '@/lib/social/types';

export const POST_MAX_LENGTH = 500;

export type { DeckSnapshot, ReplaySnapshot, PostView, FeedFilter };

export type CreatePostResult =
  | { ok: true; post: PostView }
  | { ok: false; errorKey: string; status: number };

interface CreatePostInput {
  body?: unknown;
  deckId?: unknown;
  gifUrl?: unknown;
  parentId?: unknown;
  repostOfId?: unknown;
  replayGameId?: unknown;
  replayActionIndex?: unknown;
}

const GIF_HOST_RE = /^https:\/\/(media[0-9]*\.tenor\.com|c\.tenor\.com|tenor\.com)\//;

async function snapshotDeck(authorId: string, deckId: string): Promise<DeckSnapshot | null> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { id: true, name: true, cardIds: true, missionIds: true, userId: true },
  });
  if (!deck || deck.userId !== authorId) return null;
  return { deckId: deck.id, name: deck.name, cardIds: deck.cardIds, missionIds: deck.missionIds };
}

async function snapshotReplay(authorId: string, gameId: string, actionIndex: number | null): Promise<ReplaySnapshot | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true, status: true, player1Id: true, player2Id: true, winnerId: true,
      player1Score: true, player2Score: true, isAiGame: true,
      player1: { select: { username: true } }, player2: { select: { username: true } },
    },
  });
  if (!game || game.status !== 'completed') return null;
  if (game.player1Id !== authorId && game.player2Id !== authorId) return null;
  const winnerName = game.winnerId === game.player1Id ? (game.player1?.username ?? null)
    : game.winnerId === game.player2Id ? (game.player2?.username ?? null) : null;
  return {
    gameId: game.id,
    actionIndex: actionIndex != null && actionIndex >= 0 ? actionIndex : undefined,
    player1Name: game.player1?.username ?? 'Player 1',
    player2Name: game.player2?.username ?? (game.isAiGame ? 'AI' : 'Player 2'),
    winnerName,
    player1Score: game.player1Score,
    player2Score: game.player2Score,
    isAiGame: game.isAiGame,
  };
}

export async function createPost(authorId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const deckId = typeof input.deckId === 'string' ? input.deckId : null;
  const gifUrl = typeof input.gifUrl === 'string' && GIF_HOST_RE.test(input.gifUrl) ? input.gifUrl : null;
  const parentId = typeof input.parentId === 'string' ? input.parentId : null;
  const repostOfId = typeof input.repostOfId === 'string' ? input.repostOfId : null;

  if (body.length > POST_MAX_LENGTH) return { ok: false, errorKey: 'feed.error.tooLong', status: 400 };

  let deckSnapshot: DeckSnapshot | null = null;
  if (deckId) {
    deckSnapshot = await snapshotDeck(authorId, deckId);
    if (!deckSnapshot) return { ok: false, errorKey: 'feed.error.deckNotYours', status: 400 };
    const hidden = await getHiddenCardIds();
    const allDeckIds = [...deckSnapshot.cardIds, ...deckSnapshot.missionIds];
    const hasUnrevealed = allDeckIds.some(
      (id) => getCardById(holoBaseId(id)) != null && !isCardPublicSync(id, hidden),
    );
    if (hasUnrevealed) return { ok: false, errorKey: 'feed.error.deckHasUnrevealed', status: 400 };
  }

  const replayGameId = typeof input.replayGameId === 'string' ? input.replayGameId : null;
  const replayActionIndex = typeof input.replayActionIndex === 'number' ? input.replayActionIndex : null;
  let replaySnapshot: ReplaySnapshot | null = null;
  if (replayGameId) {
    replaySnapshot = await snapshotReplay(authorId, replayGameId, replayActionIndex);
    if (!replaySnapshot) return { ok: false, errorKey: 'feed.error.replayNotYours', status: 400 };
  }

  if (parentId) {
    const parent = await prisma.post.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) return { ok: false, errorKey: 'feed.error.parentGone', status: 404 };
  }

  let repostTarget: { id: string } | null = null;
  if (repostOfId) {
    repostTarget = await prisma.post.findUnique({ where: { id: repostOfId }, select: { id: true } });
    if (!repostTarget) return { ok: false, errorKey: 'feed.error.parentGone', status: 404 };
  }

  if (!body && !deckSnapshot && !replaySnapshot && !gifUrl && !repostTarget) {
    return { ok: false, errorKey: 'feed.error.empty', status: 400 };
  }

  if (body) {
    const user = await prisma.user.findUnique({ where: { id: authorId }, select: { username: true } });
    const verdict = await holdScanMessage({
      messageId: 'post',
      roomCode: 'post',
      userId: authorId,
      username: user?.username ?? '?',
      message: body,
      channel: 'dm',
    });
    if (verdict === 'blocked') return { ok: false, errorKey: 'chat.blockedToxic', status: 422 };
  }

  const created = await prisma.post.create({
    data: {
      authorId,
      body,
      deckSnapshot: deckSnapshot ? (deckSnapshot as unknown as object) : undefined,
      replaySnapshot: replaySnapshot ? (replaySnapshot as unknown as object) : undefined,
      gifUrl: gifUrl ?? undefined,
      parentId: parentId ?? undefined,
      repostOfId: repostTarget?.id ?? undefined,
    },
  });

  if (parentId) {
    await prisma.post.update({ where: { id: parentId }, data: { replyCount: { increment: 1 } } }).catch(() => {});
  }
  if (repostTarget) {
    await prisma.post.update({ where: { id: repostTarget.id }, data: { repostCount: { increment: 1 } } }).catch(() => {});
  }

  const [view] = await serializePosts([created], authorId);
  return { ok: true, post: view };
}

type RawPost = {
  id: string;
  authorId: string;
  body: string;
  deckSnapshot: unknown;
  replaySnapshot: unknown;
  gifUrl: string | null;
  parentId: string | null;
  repostOfId: string | null;
  pinned: boolean;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  removedByModeration: boolean;
  createdAt: Date;
};

export async function serializePosts(posts: RawPost[], viewerId: string | null): Promise<PostView[]> {
  if (posts.length === 0) return [];

  const repostIds = posts.map((p) => p.repostOfId).filter((x): x is string => !!x);
  const reposts = repostIds.length
    ? await prisma.post.findMany({ where: { id: { in: repostIds } } })
    : [];
  const repostMap = new Map(reposts.map((r) => [r.id, r as RawPost]));

  const authorIds = new Set<string>();
  for (const p of posts) authorIds.add(p.authorId);
  for (const r of reposts) authorIds.add(r.authorId);
  const authors = await prisma.user.findMany({ where: { id: { in: [...authorIds] } }, select: { id: true, username: true } });
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const allIds = [...posts.map((p) => p.id), ...repostIds];
  const likedSet = new Set<string>();
  if (viewerId && allIds.length) {
    const likes = await prisma.postLike.findMany({ where: { userId: viewerId, postId: { in: allIds } }, select: { postId: true } });
    for (const l of likes) likedSet.add(l.postId);
  }

  const replayGameIds = new Set<string>();
  const collectReplay = (p: RawPost) => {
    const rs = p.replaySnapshot as ReplaySnapshot | null;
    if (rs?.gameId) replayGameIds.add(rs.gameId);
  };
  posts.forEach(collectReplay);
  reposts.forEach((r) => collectReplay(r as RawPost));
  const liveGames = replayGameIds.size
    ? await prisma.game.findMany({ where: { id: { in: [...replayGameIds] } }, select: { id: true } })
    : [];
  const liveGameSet = new Set(liveGames.map((g) => g.id));

  const toView = (p: RawPost, allowRepost: boolean): PostView => {
    const rs = p.removedByModeration ? null : ((p.replaySnapshot as ReplaySnapshot | null) ?? null);
    return {
      id: p.id,
      author: authorMap.get(p.authorId) ?? null,
      body: p.removedByModeration ? '' : p.body,
      deck: p.removedByModeration ? null : ((p.deckSnapshot as DeckSnapshot | null) ?? null),
      replay: rs ? { ...rs, available: liveGameSet.has(rs.gameId) } : null,
      gifUrl: p.removedByModeration ? null : p.gifUrl,
      createdAt: p.createdAt.toISOString(),
      parentId: p.parentId,
      pinned: p.pinned,
      replyCount: p.replyCount,
      likeCount: p.likeCount,
      repostCount: p.repostCount,
      viewerLiked: likedSet.has(p.id),
      repostOf: allowRepost && p.repostOfId && repostMap.has(p.repostOfId) ? toView(repostMap.get(p.repostOfId)!, false) : null,
    };
  };

  return posts.map((p) => toView(p, true));
}

export async function getFeed(viewerId: string | null, filter: FeedFilter, cursor: string | null): Promise<{ posts: PostView[]; nextCursor: string | null }> {
  const where: Record<string, unknown> = { OR: [{ parentId: null }, { parentId: { isSet: false } }] };
  if (cursor) where.createdAt = { lt: new Date(cursor) };

  if ((filter === 'following' || filter === 'friends') && viewerId) {
    let ids = await getFollowingIds(viewerId);
    if (filter === 'friends') {
      const friends = await prisma.friendship.findMany({
        where: { status: 'accepted', OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
        select: { senderId: true, receiverId: true },
      });
      const friendIds = new Set<string>();
      for (const f of friends) friendIds.add(f.senderId === viewerId ? f.receiverId : f.senderId);
      ids = ids.filter((id) => friendIds.has(id));
    }
    ids.push(viewerId);
    where.authorId = { in: ids };
  }

  const raw = await prisma.post.findMany({ where: where as never, orderBy: { createdAt: 'desc' }, take: 40 });
  const hidden = await getHiddenAuthorIds(viewerId, raw.map((p) => p.authorId));
  const visible = raw.filter((p) => !hidden.has(p.authorId));
  const hasMore = visible.length > 20 || raw.length >= 40;
  const page = visible.slice(0, 20);
  const posts = await serializePosts(page as RawPost[], viewerId);
  const nextCursor = page.length > 0 && hasMore ? page[page.length - 1].createdAt.toISOString() : null;
  return { posts, nextCursor };
}

export async function getThread(viewerId: string | null, postId: string): Promise<{ post: PostView; replies: PostView[] } | null> {
  const root = await prisma.post.findUnique({ where: { id: postId } });
  if (!root) return null;
  if (!(await canViewerSeePostsOf(viewerId, root.authorId))) return null;
  const replyRows = await prisma.post.findMany({ where: { parentId: postId }, orderBy: { createdAt: 'asc' }, take: 200 });
  const [post] = await serializePosts([root as RawPost], viewerId);
  const replies = await serializePosts(replyRows as RawPost[], viewerId);
  return { post, replies };
}

export async function getUserPosts(viewerId: string | null, userId: string): Promise<PostView[]> {
  if (!(await canViewerSeePostsOf(viewerId, userId))) return [];
  const rows = await prisma.post.findMany({
    where: { authorId: userId, OR: [{ parentId: null }, { parentId: { isSet: false } }] },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 40,
  });
  return serializePosts(rows as RawPost[], viewerId);
}

export async function toggleLike(userId: string, postId: string): Promise<{ liked: boolean; likeCount: number } | null> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) return null;
  const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } }, select: { id: true } });
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    const updated = await prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } });
    return { liked: false, likeCount: Math.max(0, updated.likeCount) };
  }
  await prisma.postLike.create({ data: { postId, userId } });
  const updated = await prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
  return { liked: true, likeCount: updated.likeCount };
}

export async function togglePin(userId: string, postId: string): Promise<{ pinned: boolean } | null> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, pinned: true, parentId: true } });
  if (!post || post.authorId !== userId || post.parentId) return null;
  const nextPinned = !post.pinned;
  if (nextPinned) {
    await prisma.post.updateMany({ where: { authorId: userId, pinned: true }, data: { pinned: false } });
  }
  await prisma.post.update({ where: { id: postId }, data: { pinned: nextPinned } });
  return { pinned: nextPinned };
}

export async function deletePost(userId: string, postId: string, isAdmin: boolean): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, parentId: true, repostOfId: true } });
  if (!post) return false;
  if (post.authorId !== userId && !isAdmin) return false;
  await prisma.post.deleteMany({ where: { parentId: postId } });
  await prisma.postLike.deleteMany({ where: { postId } });
  await prisma.post.delete({ where: { id: postId } });
  if (post.parentId) {
    await prisma.post.update({ where: { id: post.parentId }, data: { replyCount: { decrement: 1 } } }).catch(() => {});
  }
  if (post.repostOfId) {
    await prisma.post.update({ where: { id: post.repostOfId }, data: { repostCount: { decrement: 1 } } }).catch(() => {});
  }
  return true;
}
