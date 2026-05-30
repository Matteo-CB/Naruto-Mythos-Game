import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const variantInvFindUnique = vi.fn();
const variantInvUpsert = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    variantInventory: {
      findUnique: (...a: unknown[]) => variantInvFindUnique(...a),
      upsert: (...a: unknown[]) => variantInvUpsert(...a),
    },
  },
}));

import { POST } from '@/app/api/battlepass/claim-card/route';

function makeReq(body: unknown): Request {
  return new Request('http://test/api/battlepass/claim-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/battlepass/claim-card', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueUser.mockReset();
    updateUser.mockReset();
    variantInvFindUnique.mockReset();
    variantInvUpsert.mockReset();
    variantInvFindUnique.mockResolvedValue(null);
    variantInvUpsert.mockResolvedValue({ count: 1 });
  });

  it('401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 25 }) as never);
    expect(res.status).toBe(401);
  });

  it('400 invalid body', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(new Request('http://test/api/battlepass/claim-card', { method: 'POST', body: 'not-json' }) as never);
    expect(res.status).toBe(400);
  });

  it('400 if tier not in card-tier whitelist', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeReq({ tier: 24 }) as never);
    expect(res.status).toBe(400);
  });

  it('400 if user has not reached the tier', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 24 });
    const res = await POST(makeReq({ tier: 25 }) as never);
    expect(res.status).toBe(400);
  });

  it('409 if card already unlocked', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 25 });
    variantInvFindUnique.mockResolvedValue({ count: 1 });
    const res = await POST(makeReq({ tier: 25 }) as never);
    expect(res.status).toBe(409);
    expect(variantInvUpsert).not.toHaveBeenCalled();
  });

  it('200 grants the card for tier 25 (KS-137-MV)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 25 });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 25 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe(25);
    expect(body.cardId).toBe('KS-137-MV');
    expect(variantInvUpsert).toHaveBeenCalledTimes(1);
    const args = variantInvUpsert.mock.calls[0][0];
    expect(args.where).toMatchObject({ userId_cardId: { userId: 'u1', cardId: 'KS-137-MV' } });
  });

  it('200 grants the card for tier 5 (KS-133_2-MV)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 5 });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 5 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe(5);
    expect(body.cardId).toBe('KS-133_2-MV');
  });

  it('200 grants the card for tier 50 (KS-133-MV)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 50 });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 50 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cardId).toBe('KS-133-MV');
  });

  it('404 if user not found', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    findUniqueUser.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 25 }) as never);
    expect(res.status).toBe(404);
  });
});
