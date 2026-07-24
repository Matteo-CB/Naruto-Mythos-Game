import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { reportDmMessage } from '@/lib/social/reports';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  const reason = typeof body.reason === 'string' ? body.reason : null;
  if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
  const ok = await reportDmMessage(session.user.id, session.user.name ?? '?', messageId, reason);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
