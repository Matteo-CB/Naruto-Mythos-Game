import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const VALID_BADGES = ['admin', 'league'];

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { badgePrefs } = body as { badgePrefs: string[] };

    if (!Array.isArray(badgePrefs) || badgePrefs.some((b) => !VALID_BADGES.includes(b))) {
      return NextResponse.json({ error: 'Invalid badge preferences' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { badgePrefs },
    });

    return NextResponse.json({ success: true, badgePrefs });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
