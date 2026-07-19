import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildCountryStandings, type CountryUser, type RankedResultRow, TEAM_SIZE } from '@/lib/worldcup/fairScore';
import { seasonBoundsForDate, previousSeasonBounds, type SeasonBounds } from '@/lib/worldcup/season';
import { finalizeSeason } from '@/lib/worldcup/finalize';
import { assignChampionRoles, syncNationalTeamRoles, type DesiredTeamMember } from '@/lib/discord/worldcupRoles';
import { announceSeasonResult } from '@/lib/discord/worldcupAnnounce';

export const dynamic = 'force-dynamic';
const SNAPSHOT_RETENTION_DAYS = 120;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function computeStandings(bounds: SeasonBounds, endExclusive?: Date) {
  const where: Record<string, unknown> = {
    createdAt: endExclusive ? { gte: bounds.start, lt: endExclusive } : { gte: bounds.start },
    isRanked: true,
    eloType: 'ranked',
  };
  const results = await prisma.eloHistory.findMany({
    where: where as never,
    select: { userId: true, result: true, opponentElo: true, isForfeit: true },
  });
  const userIds = [...new Set(results.map((r) => r.userId))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, elo: true, countryCode: true } })
    : [];
  const userMap = new Map<string, CountryUser>(users.map((u) => [u.id, { username: u.username, elo: u.elo, countryCode: u.countryCode ?? null }]));
  const rows: RankedResultRow[] = results.map((r) => ({ userId: r.userId, result: r.result, opponentElo: r.opponentElo, isForfeit: r.isForfeit === true }));
  return buildCountryStandings(rows, userMap);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const current = seasonBoundsForDate(now);
  const summary: Record<string, unknown> = { seasonKey: current.seasonKey };

  try {
    await prisma.worldcupSeason.upsert({
      where: { seasonKey: current.seasonKey },
      create: { seasonKey: current.seasonKey, startMonth: current.startMonth, endMonth: current.endMonth, label: current.endMonth, status: 'open' },
      update: {},
    });

    const standings = await computeStandings(current);

    const day = now.toISOString().slice(0, 10);
    const compact = standings.slice(0, 40).map((s, i) => ({ code: s.countryCode, score: Math.round(s.score * 10) / 10, rank: s.ranked ? i + 1 : null }));
    await prisma.worldcupSnapshot.upsert({
      where: { seasonKey_day: { seasonKey: current.seasonKey, day } },
      create: { seasonKey: current.seasonKey, day, standings: compact as unknown as object },
      update: { standings: compact as unknown as object },
    }).catch(() => {});
    const pruneBefore = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    await prisma.worldcupSnapshot.deleteMany({ where: { day: { lt: pruneBefore } } }).catch(() => {});

    const desired: DesiredTeamMember[] = [];
    for (const s of standings) {
      if (!s.ranked) continue;
      for (const p of s.topPlayers.slice(0, TEAM_SIZE)) desired.push({ userId: p.userId, countryCode: s.countryCode });
    }
    await syncNationalTeamRoles(desired).catch(() => {});
    summary.teamMembers = desired.length;

    const prev = previousSeasonBounds(now);
    const prevSeason = await prisma.worldcupSeason.findUnique({ where: { seasonKey: prev.seasonKey } }).catch(() => null);
    const prevNeedsFinalize = now.getTime() >= prev.endExclusive.getTime()
      && (!prevSeason || prevSeason.status !== 'finalized');

    if (prevNeedsFinalize) {
      await prisma.worldcupSeason.upsert({
        where: { seasonKey: prev.seasonKey },
        create: { seasonKey: prev.seasonKey, startMonth: prev.startMonth, endMonth: prev.endMonth, label: prev.endMonth, status: 'open' },
        update: {},
      });
      const prevStandings = await computeStandings(prev, prev.endExclusive);
      const result = await finalizeSeason(prev.seasonKey, prev.endMonth, prevStandings);
      summary.finalizedPrevious = result.finalized;
      summary.champion = result.championCode;
      if (result.finalized) {
        const championPlayers = result.podium[0]?.players.map((p) => p.userId) ?? [];
        const prevPrev = previousSeasonBounds(prev.start);
        await assignChampionRoles(championPlayers, prev.endMonth, prevPrev.endMonth).catch(() => {});
        await announceSeasonResult(prev.endMonth, result.podium).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron/worldcup] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'internal', ...summary }, { status: 500 });
  }
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
