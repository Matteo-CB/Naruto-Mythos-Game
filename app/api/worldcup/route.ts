import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildCountryStandings, type CountryUser } from '@/lib/worldcup/fairScore';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

export async function GET() {
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000);
    const sinceDay = since.toISOString().slice(0, 10);

    const results = await prisma.eloHistory.findMany({
      where: { createdAt: { gte: since }, isRanked: true, eloType: 'ranked' },
      select: { userId: true, result: true },
    });

    const userIds = [...new Set(results.map((r) => r.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, elo: true, countryCode: true },
        })
      : [];
    const userMap = new Map<string, CountryUser>(
      users.map((u) => [u.id, { username: u.username, elo: u.elo, countryCode: u.countryCode ?? null }]),
    );

    const standings = buildCountryStandings(results, userMap);

    const groupRows = await prisma.countryGroupStat.findMany({
      where: { day: { gte: sinceDay } },
      select: { countryCode: true, group: true, count: true },
    });
    const groupTotals = new Map<string, Map<string, number>>();
    for (const row of groupRows) {
      let byGroup = groupTotals.get(row.countryCode);
      if (!byGroup) {
        byGroup = new Map();
        groupTotals.set(row.countryCode, byGroup);
      }
      byGroup.set(row.group, (byGroup.get(row.group) ?? 0) + row.count);
    }

    const payload = standings.map((s) => {
      const byGroup = groupTotals.get(s.countryCode);
      let topGroup: string | null = null;
      let topCount = 0;
      let totalCount = 0;
      if (byGroup) {
        for (const [g, n] of byGroup) {
          totalCount += n;
          if (n > topCount) {
            topCount = n;
            topGroup = g;
          }
        }
      }
      return {
        ...s,
        winRate: Math.round(s.winRate * 1000) / 10,
        score: Math.round(s.score * 1000) / 10,
        topGroup,
        topGroupShare: totalCount > 0 ? Math.round((topCount / totalCount) * 100) : 0,
      };
    });

    const totalGames = standings.reduce((s, c) => s + c.games, 0);
    const totalPlayers = standings.reduce((s, c) => s + c.players, 0);

    return NextResponse.json(
      {
        standings: payload,
        totals: { countries: standings.length, players: totalPlayers, games: totalGames },
        windowDays: WINDOW_DAYS,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
