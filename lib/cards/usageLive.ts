import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';

let groupOf: Map<string, string> | null = null;

function groups(): Map<string, string> {
  if (!groupOf) {
    groupOf = new Map();
    for (const c of getAllCards()) groupOf.set(c.id, `${c.set}#${c.number}`);
  }
  return groupOf;
}

export async function recordRankedDeckUsage(decks: Array<string[] | null | undefined>): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const g = groups();

  let deckCount = 0;
  const counts: Record<string, number> = {};
  for (const ids of decks) {
    if (!ids || ids.length === 0) continue;
    deckCount++;
    const inDeck = new Set<string>();
    for (const id of ids) {
      const grp = g.get(id);
      if (grp) inDeck.add(grp);
    }
    for (const grp of inDeck) counts[grp] = (counts[grp] ?? 0) + 1;
  }
  if (deckCount === 0) return;

  await prisma.cardUsageDayTotal.upsert({
    where: { date },
    create: { date, decks: deckCount, games: 1 },
    update: { decks: { increment: deckCount }, games: { increment: 1 } },
  });
  for (const [cardId, n] of Object.entries(counts)) {
    await prisma.cardUsageDay.upsert({
      where: { date_cardId: { date, cardId } },
      create: { date, cardId, decks: n },
      update: { decks: { increment: n } },
    });
  }
}
