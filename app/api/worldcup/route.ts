import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildCountryStandings, type CountryUser } from '@/lib/worldcup/fairScore';
import { seasonBoundsForDate } from '@/lib/worldcup/season';

export const dynamic = 'force-dynamic';

export type WorldcupWindow = '24h' | '7d' | '30d' | 'season';

function resolveSince(window: WorldcupWindow): { since: Date; label: WorldcupWindow; startMonth: string | null; endMonth: string | null } {
  const now = new Date();
  if (window === '24h') return { since: new Date(now.getTime() - 86400000), label: '24h', startMonth: null, endMonth: null };
  if (window === '7d') return { since: new Date(now.getTime() - 7 * 86400000), label: '7d', startMonth: null, endMonth: null };
  if (window === '30d') return { since: new Date(now.getTime() - 30 * 86400000), label: '30d', startMonth: null, endMonth: null };
  const s = seasonBoundsForDate(now);
  return { since: s.start, label: 'season', startMonth: s.startMonth, endMonth: s.endMonth };
}

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get('window');
    const window: WorldcupWindow = raw === '24h' || raw === '7d' || raw === '30d' ? raw : 'season';
    const { since, label, startMonth, endMonth } = resolveSince(window);
    const sinceDay = since.toISOString().slice(0, 10);

    const results = await prisma.eloHistory.findMany({
      where: { createdAt: { gte: since }, isRanked: true, eloType: 'ranked' },
      select: { userId: true, result: true, opponentElo: true, isForfeit: true },
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

    const standings = buildCountryStandings(
      results.map((r) => ({ userId: r.userId, result: r.result, opponentElo: r.opponentElo, isForfeit: r.isForfeit === true })),
      userMap,
    );

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
        score: Math.round(s.score * 10) / 10,
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
        window: label,
        seasonStart: startMonth,
        seasonEnd: endMonth,
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
