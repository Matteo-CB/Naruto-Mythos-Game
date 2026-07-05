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
    const type = searchParams.get('type')?.trim() === 'evolving' ? 'evolving' : 'ranked';
    const isEvolving = type === 'evolving';
    const eloField = isEvolving ? 'evolvingElo' : 'elo';

    const conditions: Record<string, unknown>[] = [];

    if (search) {
      conditions.push({ username: { contains: search, mode: 'insensitive' as const } });
    }

    if (isEvolving) {
      conditions.push({
        OR: [
          { evolvingGamesPlayed: { gt: 0 } },
          { evolvingWins: { gt: 0 } },
          { evolvingLosses: { gt: 0 } },
          { evolvingDraws: { gt: 0 } },
        ],
      });
    }

    if (!isEvolving && league && league !== 'unranked') {
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

    const needsPostFilter = !isEvolving && !!league && league !== 'unranked';
    const fetchLimit = needsPostFilter ? Math.min(limit * 3, 150) : limit;
    const fetchSkip = needsPostFilter ? 0 : offset;

    let users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        countryCode: true,
        elo: true,
        evolvingElo: true,
        wins: true,
        losses: true,
        draws: true,
        evolvingWins: true,
        evolvingLosses: true,
        evolvingDraws: true,
        role: true,
        badgePrefs: true,
        consecutiveWins: true,
        consecutiveLosses: true,
        tournamentWins: true,
      },
      orderBy: { [eloField]: 'desc' },
      take: fetchLimit,
      skip: fetchSkip,
    });

    if (!isEvolving && league === 'unranked') {
      const unrankedConditions: Record<string, unknown>[] = [
        { wins: { lt: PLACEMENT_MATCHES } },
        { losses: { lt: PLACEMENT_MATCHES } },
        { draws: { lt: PLACEMENT_MATCHES } },
      ];
      if (search) unrankedConditions.push({ username: { contains: search, mode: 'insensitive' as const } });
      const allUsers = await prisma.user.findMany({
        where: { AND: unrankedConditions },
        select: { id: true, username: true, countryCode: true, elo: true, evolvingElo: true, wins: true, losses: true, draws: true, evolvingWins: true, evolvingLosses: true, evolvingDraws: true, role: true, badgePrefs: true, consecutiveWins: true, consecutiveLosses: true, tournamentWins: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      users = allUsers.filter((u) => u.wins + u.losses + u.draws < PLACEMENT_MATCHES);
    } else if (!isEvolving && league) {
      users = users.filter((u) => u.wins + u.losses + u.draws >= PLACEMENT_MATCHES);
    }

    const total = (!isEvolving && (league === 'unranked' || needsPostFilter))
      ? users.length
      : await prisma.user.count({ where });

    if (!isEvolving && (league === 'unranked' || needsPostFilter)) {
      users = users.slice(offset, offset + limit);
    }

    const response = NextResponse.json({ users, total, limit, offset, type });
    response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
