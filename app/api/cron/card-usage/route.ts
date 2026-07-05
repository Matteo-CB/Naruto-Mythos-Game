import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { computeCardUsage } from '@/lib/cards/usageCompute';

const HOURLY_PHASE_MS = 24 * 60 * 60 * 1000;
const DAILY_MIN_GAP_MS = 22 * 60 * 60 * 1000;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = Date.now();
    const meta = await prisma.cardUsageMeta.findUnique({ where: { key: 'singleton' } });
    const firstDataAt = meta?.firstDataAt?.getTime() ?? null;
    const inHourlyPhase = firstDataAt == null || now - firstDataAt < HOURLY_PHASE_MS;

    if (!inHourlyPhase) {
      const lastComputedAt = meta?.computedAt?.getTime() ?? 0;
      if (now - lastComputedAt < DAILY_MIN_GAP_MS) {
        return NextResponse.json({ ok: true, skipped: true, phase: 'daily' });
      }
    }

    const result = await computeCardUsage();

    await prisma.cardUsageStat.deleteMany({});
    await prisma.cardUsageStat.createMany({
      data: result.cards.map((c) => ({ cardId: c.cardId, count: c.count, rate: c.rate, tier: c.tier })),
    });
    const markFirstData = firstDataAt == null && result.totalDecks > 0 ? new Date() : undefined;
    await prisma.cardUsageMeta.upsert({
      where: { key: 'singleton' },
      create: { key: 'singleton', totalDecks: result.totalDecks, activePlayers: result.activePlayers, firstDataAt: markFirstData },
      update: { totalDecks: result.totalDecks, activePlayers: result.activePlayers, computedAt: new Date(), ...(markFirstData ? { firstDataAt: markFirstData } : {}) },
    });

    return NextResponse.json({
      ok: true,
      phase: inHourlyPhase ? 'hourly' : 'daily',
      totalDecks: result.totalDecks,
      activePlayers: result.activePlayers,
      cards: result.cards.length,
    });
  } catch {
    return NextResponse.json({ error: 'Computation failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
