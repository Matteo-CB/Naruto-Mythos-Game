import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { computeCardUsage } from '@/lib/cards/usageCompute';
import { getAllCards } from '@/lib/data/cardLoader';
import { usageGroupKey } from '@/lib/cards/usageLive';

interface GameStatsEntry {
  gamesSeen: number;
  gamesWon: number;
  timesPlayed: number;
  timesRevealed: number;
  timesUpgraded: number;
  copiesSum: number;
  copyDecks: number;
}

async function loadGameStatsByCardId(): Promise<Record<string, GameStatsEntry>> {
  const rows = await prisma.cardGameStat.findMany({
    select: {
      groupKey: true,
      gamesSeen: true,
      gamesWon: true,
      timesPlayed: true,
      timesRevealed: true,
      timesUpgraded: true,
      copiesSum: true,
      copyDecks: true,
    },
  });
  const byGroup = new Map(rows.map((r) => [r.groupKey, r]));
  const out: Record<string, GameStatsEntry> = {};
  for (const c of getAllCards()) {
    const r = byGroup.get(usageGroupKey(c));
    if (!r) continue;
    out[c.id] = {
      gamesSeen: r.gamesSeen,
      gamesWon: r.gamesWon,
      timesPlayed: r.timesPlayed,
      timesRevealed: r.timesRevealed,
      timesUpgraded: r.timesUpgraded,
      copiesSum: r.copiesSum,
      copyDecks: r.copyDecks,
    };
  }
  return out;
}

async function bootstrap() {
  const result = await computeCardUsage();
  try {
    await prisma.cardUsageStat.deleteMany({});
    if (result.cards.length > 0) {
      await prisma.cardUsageStat.createMany({
        data: result.cards.map((c) => ({ cardId: c.cardId, count: c.count, rate: c.rate, tier: c.tier })),
      });
    }
    await prisma.cardUsageMeta.upsert({
      where: { key: 'singleton' },
      create: { key: 'singleton', totalDecks: result.totalDecks, activePlayers: result.activePlayers },
      update: { totalDecks: result.totalDecks, activePlayers: result.activePlayers, computedAt: new Date() },
    });
  } catch { /* persistence is best-effort */ }
  return result;
}

export async function GET() {
  try {
    const [stats, meta] = await Promise.all([
      prisma.cardUsageStat.findMany({ select: { cardId: true, count: true, rate: true, tier: true } }),
      prisma.cardUsageMeta.findUnique({ where: { key: 'singleton' } }),
    ]);

    const gameStats = await loadGameStatsByCardId().catch(() => ({} as Record<string, GameStatsEntry>));

    if (stats.length === 0) {
      const result = await bootstrap();
      const cards: Record<string, { count: number; rate: number; tier: string }> = {};
      for (const c of result.cards) cards[c.cardId] = { count: c.count, rate: c.rate, tier: c.tier };
      return NextResponse.json(
        { totalDecks: result.totalDecks, activePlayers: result.activePlayers, computedAt: new Date().toISOString(), cards, gameStats },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
      );
    }

    const cards: Record<string, { count: number; rate: number; tier: string }> = {};
    for (const s of stats) cards[s.cardId] = { count: s.count, rate: s.rate, tier: s.tier };

    return NextResponse.json(
      {
        totalDecks: meta?.totalDecks ?? 0,
        activePlayers: meta?.activePlayers ?? 0,
        computedAt: meta?.computedAt ?? null,
        cards,
        gameStats,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json(
      { totalDecks: 0, activePlayers: 0, computedAt: null, cards: {} },
      { headers: { 'Cache-Control': 'public, s-maxage=600' } },
    );
  }
}
