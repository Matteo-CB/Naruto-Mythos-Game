import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import { VARIANT_PACK_SIZE } from '@/lib/variants/constants';

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
    mockCard('KS-104-RA', 'RA'),
    mockCard('KS-105-RA', 'RA'),
    mockCard('KS-106-RA', 'RA'),
  ],
}));

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUserUnique = vi.fn();
const updateUser = vi.fn();
const updateManyInventory = vi.fn();
const findUniqueInventory = vi.fn();
const variantInvFindMany = vi.fn();
const variantInvUpsert = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUserUnique(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    boosterInventory: {
      updateMany: (...a: unknown[]) => updateManyInventory(...a),
      findUnique: (...a: unknown[]) => findUniqueInventory(...a),
    },
    variantInventory: {
      findMany: (...a: unknown[]) => variantInvFindMany(...a),
      upsert: (...a: unknown[]) => variantInvUpsert(...a),
    },
  },
}));

import { POST } from '@/app/api/boosters/open/route';
import { clearVariantPoolCache } from '@/lib/variants/variantPool';

function makeRequest(body: unknown): Request {
  return new Request('http://test/api/boosters/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/boosters/open', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUserUnique.mockReset();
    updateUser.mockReset();
    updateManyInventory.mockReset();
    findUniqueInventory.mockReset();
    variantInvFindMany.mockReset();
    variantInvUpsert.mockReset();
    variantInvFindMany.mockResolvedValue([]);
    variantInvUpsert.mockResolvedValue({ count: 1 });
    clearVariantPoolCache();
  });

  it('returns 401 when unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ setId: 'KS' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when setId is missing', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when set is coming_soon', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeRequest({ setId: 'SS' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid body', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = new Request('http://test/api/boosters/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 409 when no booster is available', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 0 });
    const res = await POST(makeRequest({ setId: 'KS' }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorKey).toBe('boosters.error.noBoosterAvailable');
  });

  it('returns rolled cards on success', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    findUniqueInventory.mockResolvedValue({ count: 5 });
    const res = await POST(makeRequest({ setId: 'KS' }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cardIds).toHaveLength(VARIANT_PACK_SIZE);
    expect(body.remainingInventory).toBe(5);
  });
});
