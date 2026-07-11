import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { chatIntroSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
