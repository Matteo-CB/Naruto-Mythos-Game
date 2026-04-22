/**
 * Public endpoint: a player's ELO history for the last 14 days.
 *
 * GET /api/elo-history?user=<id|username>
 *   Returns the user's per-game ELO deltas, newest first, plus a summary and
 *   daily aggregates for charting.
 *
 * This is the public counterpart of /api/admin/elo-history (which returns the
 * same shape but requires admin auth and allows custom day windows).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ELO_HISTORY_TTL_MS } from '@/lib/db/gameCleanup';

const WINDOW_DAYS = Math.round(ELO_HISTORY_TTL_MS / (24 * 60 * 60 * 1000));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('user') ?? '';
  if (!q) return NextResponse.json({ error: 'Missing user query param' }, { status: 400 });

  const looksLikeId = /^[0-9a-f]{24}$/i.test(q);
  const user = await prisma.user.findFirst({
    where: looksLikeId
      ? { id: q }
      : { username: { equals: q, mode: 'insensitive' } },
    select: { id: true, username: true, elo: true, wins: true, losses: true, draws: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: `User "${q}" not found` }, { status: 404 });
  }

  const cutoff = new Date(Date.now() - ELO_HISTORY_TTL_MS);
  const history = await prisma.eloHistory.findMany({
    where: { userId: user.id, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'asc' }, // ascending so the chart reads left-to-right
  });

  let totalDelta = 0;
  let wins = 0, losses = 0, draws = 0;
  for (const h of history) {
    totalDelta += h.delta;
    if (h.result === 'win') wins++;
    else if (h.result === 'loss') losses++;
    else draws++;
  }

  // Aggregate per day (calendar day in UTC).
  const byDay = new Map<string, { games: number; deltaSum: number; endElo: number; wins: number; losses: number; draws: number }>();
  for (const h of history) {
    const d = h.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { games: 0, deltaSum: 0, endElo: h.newElo, wins: 0, losses: 0, draws: 0 };
    cur.games++;
    cur.deltaSum += h.delta;
    cur.endElo = h.newElo; // last game of that day wins (asc order)
    if (h.result === 'win') cur.wins++;
    else if (h.result === 'loss') cur.losses++;
    else cur.draws++;
    byDay.set(d, cur);
  }

  // Opponent breakdown (for UI "who you played against most").
  const oppMap = new Map<string, { username: string; games: number; wins: number; losses: number; deltaSum: number }>();
  for (const h of history) {
    const key = h.opponentId ?? `anon:${h.opponentUsername}`;
    const cur = oppMap.get(key) ?? { username: h.opponentUsername, games: 0, wins: 0, losses: 0, deltaSum: 0 };
    cur.games++;
    if (h.result === 'win') cur.wins++;
    else if (h.result === 'loss') cur.losses++;
    cur.deltaSum += h.delta;
    oppMap.set(key, cur);
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      elo: user.elo,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      createdAt: user.createdAt.toISOString(),
    },
    windowDays: WINDOW_DAYS,
    summary: { games: history.length, wins, losses, draws, totalDelta, distinctOpponents: oppMap.size },
    perDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    opponents: [...oppMap.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, 20),
    // Raw points for the line chart: one entry per ranked game, in order.
    points: history.map((h) => ({
      t: h.createdAt.toISOString(),
      elo: h.newElo,
      delta: h.delta,
      result: h.result,
      opponentUsername: h.opponentUsername,
      opponentElo: h.opponentElo,
    })),
  });
}
