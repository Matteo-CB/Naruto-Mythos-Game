import { describe, it, expect, vi, beforeEach } from 'vitest';

interface DayRow { date: string; cardId: string; decks: number }
interface DayTotal { date: string; decks: number; games: number }

let dayRows: DayRow[] = [];
let dayTotals: DayTotal[] = [];

const fakeRunCommandRaw = vi.fn();
const fakeEloFindMany = vi.fn();
const fakeBannedFindMany = vi.fn();
const fakeStatFindMany = vi.fn();
const fakeMetaFindUnique = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $runCommandRaw: (...a: unknown[]) => fakeRunCommandRaw(...a),
    cardUsageDay: {
      deleteMany: async ({ where }: { where: { date: string | { lt: string } } }) => {
        if (typeof where.date === 'string') {
          const d = where.date;
          dayRows = dayRows.filter((r) => r.date !== d);
        } else {
          const lt = where.date.lt;
          dayRows = dayRows.filter((r) => r.date >= lt);
        }
        return { count: 0 };
      },
      createMany: async ({ data }: { data: DayRow[] }) => {
        dayRows.push(...data);
        return { count: data.length };
      },
      findMany: async ({ where }: { where: { date: { gte: string } } }) =>
        dayRows.filter((r) => r.date >= where.date.gte).map((r) => ({ cardId: r.cardId, decks: r.decks })),
    },
    cardUsageDayTotal: {
      upsert: async ({ where, create }: { where: { date: string }; create: DayTotal }) => {
        dayTotals = dayTotals.filter((t) => t.date !== where.date);
        dayTotals.push(create);
        return create;
      },
      deleteMany: async ({ where }: { where: { date: { lt: string } } }) => {
        dayTotals = dayTotals.filter((t) => t.date >= where.date.lt);
        return { count: 0 };
      },
      findMany: async ({ where }: { where: { date: { gte: string } } }) =>
        dayTotals.filter((t) => t.date >= where.date.gte).map((t) => ({ decks: t.decks })),
    },
    eloHistory: { findMany: (...a: unknown[]) => fakeEloFindMany(...a) },
    bannedCard: { findMany: (...a: unknown[]) => fakeBannedFindMany(...a) },
    cardUsageStat: { findMany: (...a: unknown[]) => fakeStatFindMany(...a) },
    cardUsageMeta: { findUnique: (...a: unknown[]) => fakeMetaFindUnique(...a) },
  },
}));

import { GET } from '@/app/api/cards/usage/route';
import { computeCardUsage } from '@/lib/cards/usageCompute';

function rawResponse(games: Array<{ p1?: string[]; p2?: string[] }>) {
  return { cursor: { firstBatch: games } };
}

describe('computeCardUsage (decks played in ranked games over the last 14 days)', () => {
  beforeEach(() => {
    dayRows = [];
    dayTotals = [];
    fakeRunCommandRaw.mockReset();
    fakeEloFindMany.mockReset();
    fakeBannedFindMany.mockReset();
    fakeBannedFindMany.mockResolvedValue([]);
    fakeEloFindMany.mockResolvedValue([]);
  });

  it('aggregates only ranked-classic games (no AI, no evolving, elo-rated) from the Game collection', async () => {
    fakeRunCommandRaw.mockResolvedValue(rawResponse([]));
    await computeCardUsage();
    const cmd = fakeRunCommandRaw.mock.calls[0][0] as { aggregate: string; pipeline: Array<Record<string, unknown>> };
    expect(cmd.aggregate).toBe('Game');
    const match = cmd.pipeline[0].$match as Record<string, unknown>;
    expect(match.isAiGame).toBe(false);
    expect(match.isEvolving).toBe(false);
    expect(match.eloChange).toEqual({ $ne: null });
    expect(match.completedAt).toBeDefined();
  });

  it('counts each PLAYED deck once per game, shares the stat across variants, computes tiers', async () => {
    fakeRunCommandRaw
      .mockResolvedValueOnce(rawResponse([]))
      .mockResolvedValueOnce(rawResponse([]))
      .mockResolvedValueOnce(rawResponse([
        { p1: ['KS-108-R', 'KS-108-R'], p2: ['KS-108-MV'] },
        { p1: ['KS-005-C'], p2: [] },
      ]));
    const r = await computeCardUsage();

    expect(r.totalDecks).toBe(3);
    const base = r.cards.find((c) => c.cardId === 'KS-108-R')!;
    const variant = r.cards.find((c) => c.cardId === 'KS-108-MV')!;
    expect(base.count).toBe(2);
    expect(base.rate).toBeCloseTo(2 / 3);
    expect(variant.count).toBe(base.count);
    expect(variant.rate).toBe(base.rate);
    expect(variant.tier).toBe(base.tier);
    expect(base.tier).toBe('OU');
  });

  it('sums decks across the daily snapshots of the 14-day window', async () => {
    fakeRunCommandRaw
      .mockResolvedValueOnce(rawResponse([{ p1: ['KS-005-C'], p2: ['KS-108-R'] }]))
      .mockResolvedValueOnce(rawResponse([{ p1: ['KS-108-R'], p2: undefined }]))
      .mockResolvedValueOnce(rawResponse([]));
    const r = await computeCardUsage();
    expect(r.totalDecks).toBe(3);
    const naruto = r.cards.find((c) => c.cardId === 'KS-108-R')!;
    expect(naruto.count).toBe(2);
  });

  it('counts active players from distinct ranked EloHistory rows (14 days)', async () => {
    fakeRunCommandRaw.mockResolvedValue(rawResponse([]));
    fakeEloFindMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]);
    const r = await computeCardUsage();
    expect(r.activePlayers).toBe(3);
    const args = fakeEloFindMany.mock.calls[0][0] as { where: { isRanked: boolean }; distinct: string[] };
    expect(args.where.isRanked).toBe(true);
    expect(args.distinct).toEqual(['userId']);
  });

  it('marks ranked-banned cards with the BAN tier', async () => {
    fakeRunCommandRaw.mockResolvedValue(rawResponse([{ p1: ['KS-036-C'], p2: [] }]));
    const r = await computeCardUsage();
    const banned = r.cards.find((c) => c.cardId === 'SS-112-SPV')!;
    expect(banned.tier).toBe('BAN');
  });

  it('yields no data when there are no ranked games in the window', async () => {
    fakeRunCommandRaw.mockResolvedValue(rawResponse([]));
    const r = await computeCardUsage();
    expect(r.activePlayers).toBe(0);
    expect(r.totalDecks).toBe(0);
  });
});

describe('GET /api/cards/usage (serves the stored daily snapshot)', () => {
  beforeEach(() => { fakeStatFindMany.mockReset(); fakeMetaFindUnique.mockReset(); });

  it('returns stored tiers + meta with a cache header', async () => {
    fakeStatFindMany.mockResolvedValue([{ cardId: 'KS-108-R', count: 5, rate: 0.5, tier: 'OU' }]);
    fakeMetaFindUnique.mockResolvedValue({ totalDecks: 10, activePlayers: 8, computedAt: new Date() });
    const res = await GET();
    const body = await res.json();
    expect(body.totalDecks).toBe(10);
    expect(body.activePlayers).toBe(8);
    expect(body.cards['KS-108-R'].tier).toBe('OU');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });
});
