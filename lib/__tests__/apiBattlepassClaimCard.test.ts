import { BATTLEPASS_TIER_COUNT } from '@/lib/battlepass/constants';
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
    const res = await POST(makeReq({ tier: 7 }) as never);
    expect(res.status, 'le palier 7 ne porte aucune carte').toBe(400);
  });

  it('400 if user has not reached the tier', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 23 });
    const res = await POST(makeReq({ tier: 24 }) as never);
    expect(res.status).toBe(400);
  });

  it('409 if card already unlocked', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 24 });
    variantInvFindUnique.mockResolvedValue({ count: 1 });
    const res = await POST(makeReq({ tier: 24 }) as never);
    expect(res.status).toBe(409);
    expect(variantInvUpsert).not.toHaveBeenCalled();
  });

  it('accorde le chibi du palier 24', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 24 });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 24 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe(24);
    expect(body.cardId).toBe('SS-115-CHIBIV');
    expect(variantInvUpsert).toHaveBeenCalledTimes(1);
    const args = variantInvUpsert.mock.calls[0][0];
    expect(args.where).toMatchObject({ userId_cardId: { userId: 'u1', cardId: 'SS-115-CHIBIV' } });
  });

  it('accorde le premier chibi, au palier 4', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 4 });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 4 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe(4);
    expect(body.cardId).toBe('SS-031-CHIBIV');
  });

  it('accorde le chibi de SASUKE au tout dernier palier', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: BATTLEPASS_TIER_COUNT });
    variantInvFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: BATTLEPASS_TIER_COUNT }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cardId, 'la recompense finale de la saison').toBe('SS-126-CHIBIV');
  });

  it('un palier sans carte est refuse', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({ battlepassTier: 30 });
    const res = await POST(makeReq({ tier: 30 }) as never);
    expect(res.status, 'le palier 30 ne donne que des boosters').toBe(400);
  });

  it('404 if user not found', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    findUniqueUser.mockResolvedValue(null);
    const res = await POST(makeReq({ tier: 24 }) as never);
    expect(res.status).toBe(404);
  });
});
