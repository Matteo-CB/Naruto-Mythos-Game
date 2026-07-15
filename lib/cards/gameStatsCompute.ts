import { prisma } from '@/lib/db/prisma';
import { getAllCards } from '@/lib/data/cardLoader';
import { usageGroupKey } from '@/lib/cards/usageLive';
import type { CharacterCard, MissionCard, GameLogEntry, PlayerState } from '@/lib/engine/types';

const BATCH_SIZE = 50;
const MAX_PAGES = 40;
const YIELD_EVERY_GAMES = 10;
const MAX_LOG_ENTRIES = 2500;

function yieldLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

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
let factionById: Map<string, string> | null = null;

function ensureMaps(): { byId: Map<string, string>; byNameTitle: Map<string, string>; factions: Map<string, string> } {
  if (!groupById || !groupByNameTitle || !factionById) {
    groupById = new Map();
    groupByNameTitle = new Map();
    factionById = new Map();
    for (const c of getAllCards()) {
      const g = usageGroupKey(c);
      groupById.set(c.id, g);
      const key = `${c.name_fr.toUpperCase()}|${(c.title_fr ?? '').toUpperCase()}`;
      if (!groupByNameTitle.has(key)) groupByNameTitle.set(key, g);
      const faction = (c as unknown as Record<string, unknown>).group;
      if (typeof faction === 'string' && faction) factionById.set(c.id, faction);
    }
  }
  return { byId: groupById, byNameTitle: groupByNameTitle, factions: factionById };
}

export function extractFactionCounts(
  payload: SavedGamePayload,
  side: 'player1' | 'player2',
): Map<string, number> {
  const { factions } = ensureMaps();
  const counts = new Map<string, number>();
  for (const card of playerDeckCards(payload.initialState?.[side])) {
    const f = factions.get(card.id);
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
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

  const logEntries = (payload.log ?? []).slice(0, MAX_LOG_ENTRIES);
  for (const entry of logEntries) {
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

const COUNTRY_STAT_RETENTION_DAYS = 10;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function accumulateCardGameStats(): Promise<{ processed: number }> {
  const cursor = await prisma.cardStatsCursor.findUnique({ where: { key: 'singleton' } });
  const since = cursor?.lastGameAt ?? new Date(0);

  const pruneBefore = dayKey(new Date(Date.now() - COUNTRY_STAT_RETENTION_DAYS * 86400000));
  try {
    await prisma.countryGroupStat.deleteMany({ where: { day: { lt: pruneBefore } } });
  } catch { /* pruning is best-effort */ }

  let processed = 0;
  let lastAt = since;

  for (let page = 0; page < MAX_PAGES; page++) {
    const games = await prisma.game.findMany({
      where: {
        status: 'completed',
        isAiGame: false,
        eloChange: { not: null },
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

    const playerIds = new Set<string>();
    for (const game of games) {
      if (game.player1Id) playerIds.add(game.player1Id);
      if (game.player2Id) playerIds.add(game.player2Id);
    }
    const countryByUser = new Map<string, string>();
    if (playerIds.size > 0) {
      const players = await prisma.user.findMany({
        where: { id: { in: [...playerIds] } },
        select: { id: true, countryCode: true },
      });
      for (const p of players) {
        if (p.countryCode) countryByUser.set(p.id, p.countryCode);
      }
    }

    const counters = new Map<string, GroupCounters>();
    const countryCounters = new Map<string, number>();
    let sinceYield = 0;
    for (const game of games) {
      const payload = game.gameState as unknown as SavedGamePayload | null;
      if (!payload || typeof payload !== 'object') continue;
      const winnerSide = game.winnerId
        ? (game.winnerId === game.player1Id ? 'player1' : game.winnerId === game.player2Id ? 'player2' : null)
        : null;
      try {
        extractGameCounters(payload, winnerSide, counters);
        const day = game.completedAt ? dayKey(game.completedAt) : null;
        if (day) {
          for (const side of ['player1', 'player2'] as const) {
            const uid = side === 'player1' ? game.player1Id : game.player2Id;
            const cc = uid ? countryByUser.get(uid) : undefined;
            if (!cc) continue;
            for (const [faction, n] of extractFactionCounts(payload, side)) {
              const key = `${cc}|${faction}|${day}`;
              countryCounters.set(key, (countryCounters.get(key) ?? 0) + n);
            }
          }
        }
      } catch { /* skip malformed games */ }
      if (++sinceYield >= YIELD_EVERY_GAMES) {
        sinceYield = 0;
        await yieldLoop();
      }
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

    for (const [key, n] of countryCounters) {
      const [countryCode, group, day] = key.split('|');
      await prisma.countryGroupStat.upsert({
        where: { countryCode_group_day: { countryCode, group, day } },
        create: { countryCode, group, day, count: n },
        update: { count: { increment: n } },
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
