import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { LEAGUE_TIERS } from '@/lib/tournament/leagueUtils';

const PLACEMENT_MATCHES = 5;

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

    // League ELO filter
    if (league && league !== 'unranked') {
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

    // For league filters: fetch a bounded set and post-filter by placement matches
    // For unranked: same approach but inverted filter
    const needsPostFilter = !!league;
    const fetchLimit = needsPostFilter ? Math.min(limit * 3, 150) : limit;
    const fetchSkip = needsPostFilter ? 0 : offset;

    let users = await prisma.user.findMany({
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
      take: fetchLimit,
      skip: fetchSkip,
    });

    // Post-filter: exclude unranked from league filters, or only show unranked
    if (league === 'unranked') {
      users = users.filter((u) => u.wins + u.losses + u.draws < PLACEMENT_MATCHES);
    } else if (league) {
      users = users.filter((u) => u.wins + u.losses + u.draws >= PLACEMENT_MATCHES);
    }

    const total = needsPostFilter ? users.length : await prisma.user.count({ where });

    // Apply pagination for league-filtered results (post-filter pagination)
    if (needsPostFilter) {
      users = users.slice(offset, offset + limit);
    }

    const response = NextResponse.json({ users, total, limit, offset });
    response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
