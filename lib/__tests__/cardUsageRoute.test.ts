import { describe, it, expect, vi, beforeEach } from 'vitest';

interface DayRow { date: string; cardId: string; decks: number }
interface DayTotal { date: string; decks: number; games: number }

let dayRows: DayRow[] = [];
let dayTotals: DayTotal[] = [];

const fakeEloFindMany = vi.fn();
const fakeBannedFindMany = vi.fn();
const fakeStatFindMany = vi.fn();
const fakeMetaFindUnique = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
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
      upsert: async ({ where, create }: { where: { date_cardId: { date: string; cardId: string } }; create: DayRow }) => {
        const found = dayRows.find((r) => r.date === where.date_cardId.date && r.cardId === where.date_cardId.cardId);
        if (found) found.decks += create.decks;
        else dayRows.push({ ...create });
        return create;
      },
      findMany: async ({ where }: { where: { date: { gte: string } } }) =>
        dayRows.filter((r) => r.date >= where.date.gte).map((r) => ({ cardId: r.cardId, decks: r.decks })),
    },
    cardUsageDayTotal: {
      upsert: async ({ where, create }: { where: { date: string }; create: DayTotal }) => {
        const found = dayTotals.find((t) => t.date === where.date);
        if (found) { found.decks += create.decks; found.games += create.games; }
        else dayTotals.push({ ...create });
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
import { recordRankedDeckUsage } from '@/lib/cards/usageLive';

describe('recordRankedDeckUsage + computeCardUsage (decks played in ranked games, 14 days)', () => {
  beforeEach(() => {
    dayRows = [];
    dayTotals = [];
    fakeEloFindMany.mockReset();
    fakeBannedFindMany.mockReset();
    fakeBannedFindMany.mockResolvedValue([]);
    fakeEloFindMany.mockResolvedValue([]);
  });

  it('counts each PLAYED deck once per game, shares the stat across variants, computes tiers', async () => {
    await recordRankedDeckUsage([['KS-108-R', 'KS-108-R'], ['KS-108-MV']]);
    await recordRankedDeckUsage([['KS-005-C'], null]);

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

  it('skips missing decks from numerator and denominator', async () => {
    await recordRankedDeckUsage([['KS-005-C'], undefined]);
    await recordRankedDeckUsage([[], ['KS-108-R']]);
    const r = await computeCardUsage();
    expect(r.totalDecks).toBe(2);
    const naruto = r.cards.find((c) => c.cardId === 'KS-108-R')!;
    expect(naruto.count).toBe(1);
  });

  it('records nothing when no deck is provided', async () => {
    await recordRankedDeckUsage([null, undefined]);
    expect(dayTotals.length).toBe(0);
    expect(dayRows.length).toBe(0);
  });

  it('counts active players from distinct ranked EloHistory rows (14 days)', async () => {
    fakeEloFindMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]);
    const r = await computeCardUsage();
    expect(r.activePlayers).toBe(3);
    const args = fakeEloFindMany.mock.calls[0][0] as { where: { isRanked: boolean }; distinct: string[] };
    expect(args.where.isRanked).toBe(true);
    expect(args.distinct).toEqual(['userId']);
  });

  it('marks ranked-banned cards with the BAN tier', async () => {
    await recordRankedDeckUsage([['KS-036-C'], null]);
    const r = await computeCardUsage();
    const banned = r.cards.find((c) => c.cardId === 'SS-112-SPV')!;
    expect(banned.tier).toBe('BAN');
  });

  it('yields no data when there are no ranked games in the window', async () => {
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
