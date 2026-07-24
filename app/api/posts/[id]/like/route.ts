import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { toggleLike } from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await toggleLike(session.user.id, id);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...result });
}
