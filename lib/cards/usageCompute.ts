import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';
import { assignUsageTiers, type UsageTier } from '@/lib/cards/usageTiers';
import { STATIC_RANKED_BANNED_CARD_IDS } from '@/lib/data/rankedBans';

const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

export async function computeCardUsage(): Promise<CardUsageResult> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const games = await prisma.game.findMany({
    where: {
      isAiGame: false,
      isEvolving: false,
      eloChange: { not: null },
      completedAt: { gte: cutoff },
    },
    select: { player1Id: true, player2Id: true },
  });

  const activeUserIds = new Set<string>();
  for (const g of games) {
    if (g.player1Id) activeUserIds.add(g.player1Id);
    if (g.player2Id) activeUserIds.add(g.player2Id);
  }

  const decks = activeUserIds.size > 0
    ? await prisma.deck.findMany({
        where: { userId: { in: [...activeUserIds] } },
        select: { cardIds: true, missionIds: true },
      })
    : [];
  const totalDecks = decks.length;

  const cards = getAllCards();
  const groupOf = new Map<string, string>();
  for (const c of cards) groupOf.set(c.id, groupKeyOf(c.set, c.number));

  const groupCounts: Record<string, number> = {};
  for (const d of decks) {
    const groupsInDeck = new Set<string>();
    for (const id of [...(d.cardIds ?? []), ...(d.missionIds ?? [])]) {
      const g = groupOf.get(id);
      if (g) groupsInDeck.add(g);
    }
    for (const g of groupsInDeck) groupCounts[g] = (groupCounts[g] ?? 0) + 1;
  }

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

  return { totalDecks, activePlayers: activeUserIds.size, cards: cardsResult };
}
