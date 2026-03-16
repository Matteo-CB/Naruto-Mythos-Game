import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { LEAGUE_TIERS } from '@/lib/tournament/leagueUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search')?.trim() || '';
    const league = searchParams.get('league')?.trim() || '';

    // Build where clause
    const conditions: Record<string, unknown>[] = [];

    if (search) {
      conditions.push({ username: { contains: search, mode: 'insensitive' as const } });
    }

    // League filter: find the tier's ELO range
    if (league) {
      const tierIdx = LEAGUE_TIERS.findIndex((t) => t.key === league);
      if (tierIdx >= 0) {
        const tier = LEAGUE_TIERS[tierIdx];
        const nextTier = LEAGUE_TIERS[tierIdx + 1];
        const eloFilter: Record<string, number> = { gte: tier.minElo };
        if (nextTier) eloFilter.lt = nextTier.minElo;
        conditions.push({ elo: eloFilter });
      }
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : { AND: conditions }
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
