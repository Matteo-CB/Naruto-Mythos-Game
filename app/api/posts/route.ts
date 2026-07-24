import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { createPost, getFeed, type FeedFilter } from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth().catch(() => null);
  const viewerId = session?.user?.id ?? null;
  const filterParam = request.nextUrl.searchParams.get('filter');
  const filter: FeedFilter = filterParam === 'following' ? 'following' : filterParam === 'friends' ? 'friends' : 'all';
  const cursor = request.nextUrl.searchParams.get('cursor');

  if ((filter === 'following' || filter === 'friends') && !viewerId) {
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  const result = await getFeed(viewerId, filter, cursor);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await createPost(session.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.errorKey, errorKey: result.errorKey }, { status: result.status });
  }
  return NextResponse.json({ success: true, post: result.post });
}
