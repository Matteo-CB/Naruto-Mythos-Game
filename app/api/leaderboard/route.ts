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

    // League filter
    if (league === 'unranked') {
      // Unranked = fewer than PLACEMENT_MATCHES total games
      // MongoDB doesn't support computed fields in where, so we use a raw approach:
      // wins + losses + draws < PLACEMENT_MATCHES
      // Prisma MongoDB doesn't support OR on aggregated fields easily,
      // so we fetch with a generous limit and filter in JS
    } else if (league) {
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

    const fetchLimit = league ? 500 : limit;
    const fetchSkip = league ? 0 : offset;

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
      // Exclude unranked players from league results
      users = users.filter((u) => u.wins + u.losses + u.draws >= PLACEMENT_MATCHES);
    }

    const total = league ? users.length : await prisma.user.count({ where });

    // Apply pagination for league-filtered results (post-filter pagination)
    if (league) {
      users = users.slice(offset, offset + limit);
    }

    return NextResponse.json({ users, total, limit, offset });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
