import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: { not: session.user.id },
      },
      select: {
        id: true,
        username: true,
        elo: true,
      },
      take: limit,
    });

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
