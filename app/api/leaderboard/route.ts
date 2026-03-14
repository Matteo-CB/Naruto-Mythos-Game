import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search')?.trim() || '';

    const where = search
      ? { username: { contains: search, mode: 'insensitive' as const } }
      : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        elo: true,
        wins: true,
        losses: true,
        draws: true,
        role: true,
        badgePrefs: true,
      },
      orderBy: { elo: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.user.count({ where });

    return NextResponse.json({ users, total, limit, offset });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
