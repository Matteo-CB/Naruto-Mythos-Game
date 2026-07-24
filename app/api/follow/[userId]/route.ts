import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { getFollowState } from '@/lib/social/followSync';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const session = await auth().catch(() => null);
  const state = await getFollowState(session?.user?.id ?? null, userId);
  return NextResponse.json(state);
}
