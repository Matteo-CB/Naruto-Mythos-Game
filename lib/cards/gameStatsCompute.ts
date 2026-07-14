import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';
import { usageGroupKey } from '@/lib/cards/usageLive';
import type { CharacterCard, MissionCard, GameLogEntry, PlayerState } from '@/lib/engine/types';

const BATCH_SIZE = 400;

export interface GroupCounters {
  gamesSeen: number;
  gamesWon: number;
  timesPlayed: number;
  timesRevealed: number;
  timesUpgraded: number;
  copiesSum: number;
  copyDecks: number;
}

interface SavedGamePayload {
  initialState?: {
    player1?: Partial<PlayerState>;
    player2?: Partial<PlayerState>;
  };
  log?: GameLogEntry[];
}

let groupById: Map<string, string> | null = null;
let groupByNameTitle: Map<string, string> | null = null;

function ensureMaps(): { byId: Map<string, string>; byNameTitle: Map<string, string> } {
  if (!groupById || !groupByNameTitle) {
    groupById = new Map();
    groupByNameTitle = new Map();
    for (const c of getAllCards()) {
      const g = usageGroupKey(c);
      groupById.set(c.id, g);
      const key = `${c.name_fr.toUpperCase()}|${(c.title_fr ?? '').toUpperCase()}`;
      if (!groupByNameTitle.has(key)) groupByNameTitle.set(key, g);
    }
  }
  return { byId: groupById, byNameTitle: groupByNameTitle };
}

function bump(map: Map<string, GroupCounters>, group: string): GroupCounters {
  let c = map.get(group);
  if (!c) {
    c = { gamesSeen: 0, gamesWon: 0, timesPlayed: 0, timesRevealed: 0, timesUpgraded: 0, copiesSum: 0, copyDecks: 0 };
    map.set(group, c);
  }
  return c;
}

function playerDeckCards(p: Partial<PlayerState> | undefined): Array<CharacterCard | MissionCard> {
  if (!p) return [];
  const out: Array<CharacterCard | MissionCard> = [];
  for (const c of p.deck ?? []) out.push(c);
  for (const c of p.hand ?? []) out.push(c);
  for (const m of p.missionCards ?? []) out.push(m);
  if (p.unusedMission) out.push(p.unusedMission);
  return out;
}

export function extractGameCounters(
  payload: SavedGamePayload,
  winnerSide: 'player1' | 'player2' | null,
  counters: Map<string, GroupCounters>,
): void {
  const { byId, byNameTitle } = ensureMaps();

  for (const side of ['player1', 'player2'] as const) {
    const cards = playerDeckCards(payload.initialState?.[side]);
    if (cards.length === 0) continue;
    const copies = new Map<string, number>();
    for (const card of cards) {
      const g = byId.get(card.id);
      if (g) copies.set(g, (copies.get(g) ?? 0) + 1);
    }
    const won = winnerSide === side;
    for (const [g, n] of copies) {
      const c = bump(counters, g);
      c.gamesSeen += 1;
      if (won) c.gamesWon += 1;
      c.copiesSum += n;
      c.copyDecks += 1;
    }
  }

  for (const entry of payload.log ?? []) {
    if (entry.action !== 'PLAY_CHARACTER' && entry.action !== 'REVEAL_CHARACTER' && entry.action !== 'UPGRADE_CHARACTER') continue;
    const params = entry.messageParams;
    const name = typeof params?.card === 'string' ? params.card : null;
    if (!name) continue;
    const title = typeof params?.title === 'string' ? params.title : '';
    const g = byNameTitle.get(`${name.toUpperCase()}|${title.toUpperCase()}`);
    if (!g) continue;
    const c = bump(counters, g);
    c.timesPlayed += 1;
    if (entry.action === 'REVEAL_CHARACTER') c.timesRevealed += 1;
    if (entry.action === 'UPGRADE_CHARACTER') c.timesUpgraded += 1;
  }
}

export async function accumulateCardGameStats(): Promise<{ processed: number }> {
  const cursor = await prisma.cardStatsCursor.findUnique({ where: { key: 'singleton' } });
  const since = cursor?.lastGameAt ?? new Date(0);

  let processed = 0;
  let lastAt = since;

  for (let page = 0; page < 20; page++) {
    const games = await prisma.game.findMany({
      where: {
        status: 'completed',
        isAiGame: false,
        completedAt: { gt: lastAt },
      },
      select: {
        winnerId: true,
        player1Id: true,
        player2Id: true,
        gameState: true,
        completedAt: true,
      },
      orderBy: { completedAt: 'asc' },
      take: BATCH_SIZE,
    });
    if (games.length === 0) break;

    const counters = new Map<string, GroupCounters>();
    for (const game of games) {
      const payload = game.gameState as unknown as SavedGamePayload | null;
      if (!payload || typeof payload !== 'object') continue;
      const winnerSide = game.winnerId
        ? (game.winnerId === game.player1Id ? 'player1' : game.winnerId === game.player2Id ? 'player2' : null)
        : null;
      try {
        extractGameCounters(payload, winnerSide, counters);
      } catch { /* skip malformed games */ }
    }

    for (const [groupKey, c] of counters) {
      await prisma.cardGameStat.upsert({
        where: { groupKey },
        create: { groupKey, ...c },
        update: {
          gamesSeen: { increment: c.gamesSeen },
          gamesWon: { increment: c.gamesWon },
          timesPlayed: { increment: c.timesPlayed },
          timesRevealed: { increment: c.timesRevealed },
          timesUpgraded: { increment: c.timesUpgraded },
          copiesSum: { increment: c.copiesSum },
          copyDecks: { increment: c.copyDecks },
        },
      });
    }

    processed += games.length;
    lastAt = games[games.length - 1].completedAt ?? lastAt;
    await prisma.cardStatsCursor.upsert({
      where: { key: 'singleton' },
      create: { key: 'singleton', lastGameAt: lastAt },
      update: { lastGameAt: lastAt },
    });

    if (games.length < BATCH_SIZE) break;
  }

  return { processed };
}
