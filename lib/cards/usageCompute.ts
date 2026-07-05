import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';
import { assignUsageTiers, type UsageTier } from '@/lib/cards/usageTiers';
import { STATIC_RANKED_BANNED_CARD_IDS } from '@/lib/data/rankedBans';

const WINDOW_DAYS = 14;
const SNAPSHOT_LOOKBACK_DAYS = 2;
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

function groupKeyOf(setId: string, number: number): string {
  return `${setId}#${number}`;
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildGroupMap(): Map<string, string> {
  const groupOf = new Map<string, string>();
  for (const c of getAllCards()) groupOf.set(c.id, groupKeyOf(c.set, c.number));
  return groupOf;
}

interface RankedGameDecksDoc {
  p1?: string[];
  p2?: string[];
}

async function fetchRankedGameDecks(dayStart: Date, dayEnd: Date): Promise<RankedGameDecksDoc[]> {
  const playerDeckIds = (player: 'player1' | 'player2') => ({
    $concatArrays: [
      { $ifNull: [`$gameState.initialState.${player}.deck.id`, []] },
      { $ifNull: [`$gameState.initialState.${player}.hand.id`, []] },
      { $ifNull: [`$gameState.initialState.${player}.missionCards.id`, []] },
    ],
  });

  const res = await prisma.$runCommandRaw({
    aggregate: 'Game',
    pipeline: [
      {
        $match: {
          isAiGame: false,
          isEvolving: false,
          eloChange: { $ne: null },
          completedAt: { $gte: { $date: dayStart.toISOString() }, $lt: { $date: dayEnd.toISOString() } },
        },
      },
      {
        $project: {
          _id: 0,
          p1: playerDeckIds('player1'),
          p2: playerDeckIds('player2'),
        },
      },
    ],
    cursor: { batchSize: 10000 },
  }) as unknown as { cursor?: { firstBatch?: RankedGameDecksDoc[] } };

  return res.cursor?.firstBatch ?? [];
}

async function snapshotDay(dateKey: string, groupOf: Map<string, string>): Promise<void> {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const games = await fetchRankedGameDecks(dayStart, dayEnd);

  const groupCounts: Record<string, number> = {};
  let decks = 0;
  for (const g of games) {
    for (const deckIds of [g.p1, g.p2]) {
      if (!Array.isArray(deckIds) || deckIds.length === 0) continue;
      decks++;
      const groupsInDeck = new Set<string>();
      for (const id of deckIds) {
        const grp = groupOf.get(id);
        if (grp) groupsInDeck.add(grp);
      }
      for (const grp of groupsInDeck) groupCounts[grp] = (groupCounts[grp] ?? 0) + 1;
    }
  }

  await prisma.cardUsageDay.deleteMany({ where: { date: dateKey } });
  const rows = Object.entries(groupCounts).map(([cardId, count]) => ({ date: dateKey, cardId, decks: count }));
  if (rows.length > 0) {
    await prisma.cardUsageDay.createMany({ data: rows });
  }
  await prisma.cardUsageDayTotal.upsert({
    where: { date: dateKey },
    create: { date: dateKey, decks, games: games.length },
    update: { decks, games: games.length },
  });
}

async function snapshotRecentDays(now: Date, groupOf: Map<string, string>): Promise<void> {
  for (let offset = SNAPSHOT_LOOKBACK_DAYS; offset >= 0; offset--) {
    const dateKey = utcDateKey(new Date(now.getTime() - offset * DAY_MS));
    await snapshotDay(dateKey, groupOf);
  }
}

async function cleanupOldSnapshots(now: Date): Promise<void> {
  const cutoffKey = utcDateKey(new Date(now.getTime() - RETENTION_DAYS * DAY_MS));
  await prisma.cardUsageDay.deleteMany({ where: { date: { lt: cutoffKey } } });
  await prisma.cardUsageDayTotal.deleteMany({ where: { date: { lt: cutoffKey } } });
}

export async function computeCardUsage(): Promise<CardUsageResult> {
  const now = new Date();
  const groupOf = buildGroupMap();

  await snapshotRecentDays(now, groupOf);
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
