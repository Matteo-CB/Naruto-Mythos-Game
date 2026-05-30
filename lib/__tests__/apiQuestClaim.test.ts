import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const updateManyQp = vi.fn();
const findUniqueQp = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const upsertInventory = vi.fn();
const findUniqueDqp = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    questProgress: {
      updateMany: (...a: unknown[]) => updateManyQp(...a),
      findUnique: (...a: unknown[]) => findUniqueQp(...a),
    },
    dailyQuestProgress: {
      findUnique: (...a: unknown[]) => findUniqueDqp(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    boosterInventory: {
      upsert: (...a: unknown[]) => upsertInventory(...a),
    },
  },
}));

import { POST } from '@/app/api/quests/[id]/claim/route';

function makeRequest(): Request {
  return new Request('http://test/api/quests/discard-10/claim', { method: 'POST' });
}

describe('POST /api/quests/[id]/claim', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    updateManyQp.mockReset();
    findUniqueQp.mockReset();
    findUniqueUser.mockReset();
    updateUser.mockReset();
    upsertInventory.mockReset();
    findUniqueDqp.mockReset();
    findUniqueDqp.mockResolvedValue(null);
  });

  it('returns 401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown quest id', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'ghost-quest' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when quest has no progress row', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyQp.mockResolvedValue({ count: 0 });
    findUniqueQp.mockResolvedValue(null);
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when quest not completed', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyQp.mockResolvedValue({ count: 0 });
    findUniqueQp.mockResolvedValue({ completed: false, claimed: false, progress: 5 });
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(400);
  });

  it('returns 409 when already claimed (idempotency)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyQp.mockResolvedValue({ count: 0 });
    findUniqueQp.mockResolvedValue({ completed: true, claimed: true, progress: 10 });
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(409);
  });

  it('awards xp on successful claim and crosses tier', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyQp.mockResolvedValue({ count: 1 });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 175, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 1 });
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xpAwarded).toBe(25);
    expect(body.newXp).toBe(200);
    expect(body.tiersAutoClaimed).toEqual([1]);
    expect(body.boostersGranted).toBe(1);
  });

  it('atomic claim: second claim attempt returns 409 even if first succeeded', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyQp.mockResolvedValue({ count: 0 });
    findUniqueQp.mockResolvedValue({ completed: true, claimed: true, progress: 10 });
    const res = await POST(makeRequest() as never, { params: Promise.resolve({ id: 'discard-10' }) });
    expect(res.status).toBe(409);
  });
});
