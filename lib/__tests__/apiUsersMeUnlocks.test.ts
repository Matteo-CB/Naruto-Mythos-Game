import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';

function mockCard(id: string, rarity: Rarity, set = 'KS'): CardData {
  return {
    id, cardId: id, set, number: 0,
    name_fr: id, title_fr: '',
    rarity, card_type: 'character', has_visual: true,
    chakra: 1, power: 1, keywords: [], group: '', effects: [],
  };
}

vi.mock('@/lib/data/cardLoader', () => ({
  getAllCards: () => [
    mockCard('KS-001-C', 'C'),
    mockCard('KS-104-R', 'R'),
    mockCard('KS-104-RA', 'RA'),
    mockCard('KS-108-MV', 'MV'),
    mockCard('KS-117-L', 'L'),
    mockCard('KS-133-MV', 'MV'),
    mockCard('KS-140-SV', 'SV'),
    mockCard('SS-001-RA', 'RA', 'SS'),
  ],
}));

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const fakeFindUnique = vi.fn();
const fakeInvFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => fakeFindUnique(...a) },
    variantInventory: { findMany: (...a: unknown[]) => fakeInvFindMany(...a) },
  },
}));

import { GET } from '@/app/api/users/me/unlocks/route';

describe('GET /api/users/me/unlocks', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    fakeFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    fakeAuth.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when user does not exist', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'ghost' } });
    fakeFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns user unlocks for a normal user', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    fakeFindUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    fakeInvFindMany.mockResolvedValue([
      { cardId: 'KS-104-RA', count: 1 },
      { cardId: 'KS-133-MV', count: 2 },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.admin).toBe(false);
    expect(body.unlockedCardIds.sort()).toEqual(['KS-104-RA', 'KS-133-MV']);
  });

  it('returns empty array when new user has no unlocks', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u2' } });
    fakeFindUnique.mockResolvedValue({ username: 'bob', email: 'b@c.com' });
    fakeInvFindMany.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.unlockedCardIds).toEqual([]);
    expect(body.admin).toBe(false);
  });

  it('admin (by username Kutxyt) gets all variants', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'admin-id' } });
    fakeFindUnique.mockResolvedValue({ username: 'Kutxyt', email: 'whatever@x.com' });
    const res = await GET();
    const body = await res.json();
    expect(body.admin).toBe(true);
    expect(body.unlockedCardIds).toContain('KS-104-RA');
    expect(body.unlockedCardIds).toContain('KS-108-MV');
    expect(body.unlockedCardIds).toContain('KS-117-L');
    expect(body.unlockedCardIds).toContain('KS-140-SV');
    expect(body.unlockedCardIds).toContain('SS-001-RA');
    expect(body.unlockedCardIds).not.toContain('KS-001-C');
    expect(body.unlockedCardIds).not.toContain('KS-104-R');
  });

  it('admin (by email) gets all variants', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'admin-id' } });
    fakeFindUnique.mockResolvedValue({ username: 'random-user', email: 'matteo.biyikli3224@gmail.com' });
    const res = await GET();
    const body = await res.json();
    expect(body.admin).toBe(true);
    expect(body.unlockedCardIds.length).toBeGreaterThan(0);
  });
});
