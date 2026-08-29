

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ELO_HISTORY_TTL_MS } from '@/lib/db/gameCleanup';

const WINDOW_DAYS = Math.round(ELO_HISTORY_TTL_MS / (24 * 60 * 60 * 1000));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('user') ?? '';
  if (!q) return NextResponse.json({ error: 'Missing user query param' }, { status: 400 });
  const demande = url.searchParams.get('type');
  const eloType = demande === 'evolving' ? 'evolving' : demande === 'highlander' ? 'highlander' : 'ranked';

  const looksLikeId = /^[0-9a-f]{24}$/i.test(q);
  const user = await prisma.user.findFirst({
    where: looksLikeId
      ? { id: q }
      : { username: { equals: q, mode: 'insensitive' } },
    select: { id: true, username: true, elo: true, evolvingElo: true, highlanderElo: true, wins: true, losses: true, draws: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: `User "${q}" not found` }, { status: 404 });
  }

  const cutoff = new Date(Date.now() - ELO_HISTORY_TTL_MS);
  const history = await prisma.eloHistory.findMany({
    where: { userId: user.id, createdAt: { gte: cutoff }, eloType },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  let totalDelta = 0;
  let wins = 0, losses = 0, draws = 0;
  for (const h of history) {
    totalDelta += h.delta;
    if (h.result === 'win') wins++;
    else if (h.result === 'loss') losses++;
    else draws++;
  }

  
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

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      elo: eloType === 'evolving' ? (user.evolvingElo ?? 500) : eloType === 'highlander' ? (user.highlanderElo ?? 500) : user.elo,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      createdAt: user.createdAt.toISOString(),
    },
    eloType,
    windowDays: WINDOW_DAYS,
    summary: { games: history.length, wins, losses, draws, totalDelta, distinctOpponents: oppMap.size },
    perDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    opponents: [...oppMap.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, 20),
    points: history.map((h) => ({
      t: h.createdAt.toISOString(),
      elo: h.newElo,
      delta: h.delta,
      result: h.result,
      opponentUsername: h.opponentUsername,
      opponentElo: h.opponentElo,
    })),
  });
  response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return response;
}
