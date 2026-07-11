import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { unblockUser } from '@/lib/social/blocks';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId: blockedId } = await params;
    if (!blockedId) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }
    await unblockUser(session.user.id, blockedId);
    refreshChatLock(session.user.id, blockedId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
