import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { listThreads, getUnreadDmCount } from '@/lib/dm/dmService';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [threads, unreadTotal] = await Promise.all([
    listThreads(session.user.id),
    getUnreadDmCount(session.user.id),
  ]);
  return NextResponse.json({ threads, unreadTotal });
}
