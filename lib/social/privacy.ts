import { prisma } from '@/lib/db/prisma';

export async function getFriendIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
    select: { senderId: true, receiverId: true },
  });
  const s = new Set<string>();
  for (const r of rows) s.add(r.senderId === userId ? r.receiverId : r.senderId);
  return s;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const f = await prisma.friendship.findFirst({
    where: { status: 'accepted', OR: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }] },
    select: { id: true },
  });
  return f !== null;
}

export async function isPrivateProfile(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { privateProfile: true } });
  return u?.privateProfile === true;
}

// True if the viewer is allowed to see the target user's posts (public author, self, or friend).
export async function canViewerSeePostsOf(viewerId: string | null, authorId: string): Promise<boolean> {
  if (viewerId && viewerId === authorId) return true;
  if (!(await isPrivateProfile(authorId))) return true;
  if (!viewerId) return false;
  return areFriends(viewerId, authorId);
}

// Given a list of author ids, returns the subset whose posts the viewer must NOT see
// (private profile, and the viewer is neither the author nor an accepted friend).
export async function getHiddenAuthorIds(viewerId: string | null, authorIds: string[]): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (authorIds.length === 0) return hidden;
  const privateAuthors = await prisma.user.findMany({
    where: { id: { in: [...new Set(authorIds)] }, privateProfile: true },
    select: { id: true },
  });
  if (privateAuthors.length === 0) return hidden;
  const friends = viewerId ? await getFriendIds(viewerId) : new Set<string>();
  for (const a of privateAuthors) {
    if (viewerId && a.id === viewerId) continue;
    if (friends.has(a.id)) continue;
    hidden.add(a.id);
  }
  return hidden;
}
