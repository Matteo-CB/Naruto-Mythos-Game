import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

const TOP_PLAYERS_POOL = 30;
const RECENT_WINDOW_DAYS = 14;
const MIN_GAMES_PLAYED = 8;
const MIN_WINRATE = 0.55;
const MAX_DECKS = 5;

let cache: { at: number; decks: RecommendedDeck[] } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface RecommendedDeck {
  deckId: string;
  cardIds: string[];
  missionIds: string[];
  ownerElo: number;
  ownerUsername: string;
  recentWins: number;
  recentLosses: number;
  recentWinrate: number;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS) {
      return NextResponse.json({ decks: cache.decks });
    }

    const topPlayers = await prisma.user.findMany({
      where: { wins: { gte: 1 } },
      orderBy: { elo: 'desc' },
      take: TOP_PLAYERS_POOL,
      select: { id: true, username: true, elo: true },
    });

    if (topPlayers.length === 0) {
      cache = { at: now, decks: [] };
      return NextResponse.json({ decks: [] });
    }

    const userIds = topPlayers.map((u) => u.id);
    const cutoff = new Date(now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const stats = await prisma.deckStats.findMany({
      where: {
        userId: { in: userIds },
        lastPlayedAt: { gte: cutoff },
      },
      orderBy: { lastPlayedAt: 'desc' },
      take: 200,
    });

    const scored = stats
      .map((s) => {
        const games = s.wins + s.losses + s.draws;
        const winrate = games > 0 ? s.wins / games : 0;
        return { stat: s, games, winrate };
      })
      .filter((s) => s.games >= MIN_GAMES_PLAYED && s.winrate >= MIN_WINRATE)
      .sort((a, b) => {
        const scoreA = a.stat.wins * 2 + a.winrate * 50;
        const scoreB = b.stat.wins * 2 + b.winrate * 50;
        return scoreB - scoreA;
      });

    const candidates = scored.slice(0, MAX_DECKS * 2);
    const deckIds = candidates.map((c) => c.stat.deckId);

    if (deckIds.length === 0) {
      cache = { at: now, decks: [] };
      return NextResponse.json({ decks: [] });
    }

    const decks = await prisma.deck.findMany({
      where: { id: { in: deckIds } },
      select: { id: true, cardIds: true, missionIds: true, userId: true },
    });

    const userById = new Map(topPlayers.map((u) => [u.id, u]));
    const candidateByDeckId = new Map(candidates.map((c) => [c.stat.deckId, c]));

    const valid: RecommendedDeck[] = decks
      .filter((d) => d.cardIds.length >= 30 && d.missionIds.length >= 3)
      .map((d) => {
        const owner = userById.get(d.userId);
        const c = candidateByDeckId.get(d.id);
        if (!owner || !c) return null;
        return {
          deckId: d.id,
          cardIds: d.cardIds,
          missionIds: d.missionIds,
          ownerElo: owner.elo,
          ownerUsername: owner.username,
          recentWins: c.stat.wins,
          recentLosses: c.stat.losses,
          recentWinrate: Math.round(c.winrate * 100),
        };
      })
      .filter((d): d is RecommendedDeck => d !== null)
      .slice(0, MAX_DECKS);

    cache = { at: now, decks: valid };
    return NextResponse.json({ decks: valid });
  } catch (err) {
    console.error('[ai-decks recommended] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ decks: [] });
  }
}
