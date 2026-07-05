import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';
import { assignUsageTiers, type UsageTier } from '@/lib/cards/usageTiers';
import { STATIC_RANKED_BANNED_CARD_IDS } from '@/lib/data/rankedBans';
import { usageGroupKey } from '@/lib/cards/usageLive';

const WINDOW_DAYS = 14;
const RETENTION_DAYS = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComputedCardUsage {
  cardId: string;
  count: number;
  rate: number;
  tier: UsageTier;
}

export interface CardUsageResult {
  totalDecks: number;
  activePlayers: number;
  cards: ComputedCardUsage[];
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function cleanupOldSnapshots(now: Date): Promise<void> {
  const cutoffKey = utcDateKey(new Date(now.getTime() - RETENTION_DAYS * DAY_MS));
  await prisma.cardUsageDay.deleteMany({ where: { date: { lt: cutoffKey } } });
  await prisma.cardUsageDayTotal.deleteMany({ where: { date: { lt: cutoffKey } } });
}

export async function computeCardUsage(): Promise<CardUsageResult> {
  const now = new Date();

  await cleanupOldSnapshots(now);

  const windowStartKey = utcDateKey(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));

  const [dayRows, dayTotals, activeRows] = await Promise.all([
    prisma.cardUsageDay.findMany({
      where: { date: { gte: windowStartKey } },
      select: { cardId: true, decks: true },
    }),
    prisma.cardUsageDayTotal.findMany({
      where: { date: { gte: windowStartKey } },
      select: { decks: true },
    }),
    prisma.eloHistory.findMany({
      where: { isRanked: true, createdAt: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY_MS) } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const totalDecks = dayTotals.reduce((sum, d) => sum + d.decks, 0);
  const activePlayers = activeRows.length;

  const groupCounts: Record<string, number> = {};
  for (const row of dayRows) {
    groupCounts[row.cardId] = (groupCounts[row.cardId] ?? 0) + row.decks;
  }

  const cards = getAllCards();
  const groupOf = new Map<string, string>();
  for (const c of cards) groupOf.set(c.id, usageGroupKey(c));

  const uniqueGroups = [...new Set(cards.map((c) => groupOf.get(c.id)!))];
  const groupRates = uniqueGroups.map((g) => ({
    cardId: g,
    rate: totalDecks > 0 ? (groupCounts[g] ?? 0) / totalDecks : 0,
  }));
  const groupTiers = assignUsageTiers(groupRates);

  const dbBanned = await prisma.bannedCard.findMany({ select: { cardId: true } });
  const bannedIds = new Set<string>([...STATIC_RANKED_BANNED_CARD_IDS, ...dbBanned.map((b) => b.cardId)]);

  const cardsResult: ComputedCardUsage[] = cards.map((c) => {
    const g = groupOf.get(c.id)!;
    const count = groupCounts[g] ?? 0;
    const rate = totalDecks > 0 ? count / totalDecks : 0;
    const tier: UsageTier = bannedIds.has(c.id) ? 'BAN' : (groupTiers.get(g) ?? 'NU');
    return { cardId: c.id, count, rate, tier };
  });

  return { totalDecks, activePlayers, cards: cardsResult };
}
