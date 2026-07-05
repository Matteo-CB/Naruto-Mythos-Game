import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeGameFindMany = vi.fn();
const fakeDeckFindMany = vi.fn();
const fakeBannedFindMany = vi.fn();
const fakeStatFindMany = vi.fn();
const fakeMetaFindUnique = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    game: { findMany: (...a: unknown[]) => fakeGameFindMany(...a) },
    deck: { findMany: (...a: unknown[]) => fakeDeckFindMany(...a) },
    bannedCard: { findMany: (...a: unknown[]) => fakeBannedFindMany(...a) },
    cardUsageStat: { findMany: (...a: unknown[]) => fakeStatFindMany(...a) },
    cardUsageMeta: { findUnique: (...a: unknown[]) => fakeMetaFindUnique(...a) },
  },
}));

import { GET } from '@/app/api/cards/usage/route';
import { computeCardUsage } from '@/lib/cards/usageCompute';

describe('computeCardUsage (ranked-classic decks of players active in the last 14 days)', () => {
  beforeEach(() => {
    fakeGameFindMany.mockReset();
    fakeDeckFindMany.mockReset();
    fakeBannedFindMany.mockReset();
    fakeBannedFindMany.mockResolvedValue([]);
  });

  it('only queries ranked-classic games (no AI, no evolving, elo-rated)', async () => {
    fakeGameFindMany.mockResolvedValue([]);
    await computeCardUsage();
    const where = (fakeGameFindMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.isAiGame).toBe(false);
    expect(where.isEvolving).toBe(false);
    expect(where.eloChange).toEqual({ not: null });
  });

  it('shares the same stat across all variants of a card, and computes tiers', async () => {
    fakeGameFindMany.mockResolvedValue([{ player1Id: 'u1', player2Id: 'u2' }]);
    fakeDeckFindMany.mockResolvedValue([
      { cardIds: ['KS-108-R'], missionIds: [] },
      { cardIds: ['KS-108-MV'], missionIds: [] },
    ]);
    const r = await computeCardUsage();
    const base = r.cards.find((c) => c.cardId === 'KS-108-R')!;
    const variant = r.cards.find((c) => c.cardId === 'KS-108-MV')!;
    expect(base.count).toBe(2);
    expect(base.rate).toBe(1);
    expect(variant.count).toBe(base.count);
    expect(variant.rate).toBe(base.rate);
    expect(variant.tier).toBe(base.tier);
    expect(base.tier).toBe('OU');
  });

  it('marks ranked-banned cards with the BAN tier', async () => {
    fakeGameFindMany.mockResolvedValue([{ player1Id: 'u1' }]);
    fakeDeckFindMany.mockResolvedValue([{ cardIds: ['KS-036-C'], missionIds: [] }]);
    fakeBannedFindMany.mockResolvedValue([]);
    const r = await computeCardUsage();
    const banned = r.cards.find((c) => c.cardId === 'SS-112-SPV')!;
    expect(banned.tier).toBe('BAN');
  });

  it('yields no data when there are no ranked games in the window', async () => {
    fakeGameFindMany.mockResolvedValue([]);
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
