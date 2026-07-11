import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === 'string').slice(0, 20) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No ids' }, { status: 400 });
  }
  await prisma.playerNotification.updateMany({
    where: { id: { in: ids }, userId: session.user.id },
    data: { seenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
