

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const q = url.searchParams.get('user') ?? '';
  const daysParam = Number(url.searchParams.get('days') ?? '14');
  const days = Math.max(1, Math.min(14, isFinite(daysParam) ? daysParam : 14));

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

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const history = await prisma.eloHistory.findMany({
    where: { userId: user.id, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
  });

  
  const opponents = new Map<string, { username: string; count: number; deltaSum: number; wins: number; losses: number }>();
  let totalDelta = 0;
  let wins = 0, losses = 0, draws = 0;
  for (const h of history) {
    totalDelta += h.delta;
    if (h.result === 'win') wins++;
    else if (h.result === 'loss') losses++;
    else draws++;
    const key = h.opponentId ?? `anon:${h.opponentUsername}`;
    const cur = opponents.get(key) ?? { username: h.opponentUsername, count: 0, deltaSum: 0, wins: 0, losses: 0 };
    cur.count++;
    cur.deltaSum += h.delta;
    if (h.result === 'win') cur.wins++;
    else if (h.result === 'loss') cur.losses++;
    opponents.set(key, cur);
  }

  
  const byDay = new Map<string, { games: number; deltaSum: number; wins: number; losses: number }>();
  for (const h of history) {
    const d = h.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { games: 0, deltaSum: 0, wins: 0, losses: 0 };
    cur.games++;
    cur.deltaSum += h.delta;
    if (h.result === 'win') cur.wins++;
    else if (h.result === 'loss') cur.losses++;
    byDay.set(d, cur);
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
    windowDays: days,
    windowStart: cutoff.toISOString(),
    summary: {
      games: history.length,
      wins, losses, draws,
      totalDelta,
      distinctOpponents: opponents.size,
    },
    opponents: [...opponents.entries()]
      .map(([id, v]) => ({ id, username: v.username, games: v.count, deltaSum: v.deltaSum, wins: v.wins, losses: v.losses }))
      .sort((a, b) => b.games - a.games),
    perDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? 1 : -1)),
    history: history.map((h) => ({
      id: h.id,
      gameId: h.gameId,
      opponentId: h.opponentId,
      opponentUsername: h.opponentUsername,
      opponentElo: h.opponentElo,
      oldElo: h.oldElo,
      newElo: h.newElo,
      delta: h.delta,
      result: h.result,
      myScore: h.myScore,
      opponentScore: h.opponentScore,
      isRanked: h.isRanked,
      createdAt: h.createdAt.toISOString(),
    })),
  });
}
