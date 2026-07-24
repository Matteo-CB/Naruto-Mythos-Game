import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';
import { getThread, deletePost } from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth().catch(() => null);
  const thread = await getThread(session?.user?.id ?? null, id);
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(thread);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin({ username: session.user.name, email: session.user.email });
  const ok = await deletePost(session.user.id, id, admin);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
