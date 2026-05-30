import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUESTS } from '@/lib/quests/questData';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findManyQp = vi.fn();
const findUniqueQp = vi.fn();
const findUniqueDqa = vi.fn();
const findUniqueDqp = vi.fn();
const updateManyDqp = vi.fn();
const findManyInventory = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    questProgress: { findMany: (...a: unknown[]) => findManyQp(...a), findUnique: (...a: unknown[]) => findUniqueQp(...a) },
    dailyQuestAssignment: { findUnique: (...a: unknown[]) => findUniqueDqa(...a), create: vi.fn(), findMany: vi.fn(() => Promise.resolve([])) },
    dailyQuestProgress: { findUnique: (...a: unknown[]) => findUniqueDqp(...a), updateMany: (...a: unknown[]) => updateManyDqp(...a) },
    boosterInventory: { findMany: (...a: unknown[]) => findManyInventory(...a) },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/quests/dailyAssignment', async (orig) => {
  const real = await orig() as Record<string, unknown>;
  return {
    ...real,
    ensureTodaysDailyQuest: vi.fn(async () => {
      const { QUESTS } = await import('@/lib/quests/questData');
      return { date: '2026-05-25', quest: QUESTS[0], created: false };
    }),
  };
});

import { GET as GetQuests } from '@/app/api/quests/route';
import { GET as GetDaily, POST as PostDaily } from '@/app/api/quests/daily/route';
import { POST as PostTrackUI } from '@/app/api/quests/track-ui/route';
import { GET as GetInventory } from '@/app/api/boosters/inventory/route';

describe('GET /api/quests', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findManyQp.mockReset();
  });

  it('returns 401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GetQuests();
    expect(res.status).toBe(401);
  });

  it('returns the full quest catalogue with progress merged', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findManyQp.mockResolvedValue([
      { questId: 'discard-10', progress: 5, target: 10, completed: false, claimed: false, completedAt: null, claimedAt: null },
    ]);
    const res = await GetQuests();
    const body = await res.json();
    expect(body.quests.length).toBe(QUESTS.length);
    const discard10 = body.quests.find((q: { id: string }) => q.id === 'discard-10');
    expect(discard10.progress).toBe(5);
    expect(discard10.completed).toBe(false);
  });

  it('quests not started have progress 0', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findManyQp.mockResolvedValue([]);
    const res = await GetQuests();
    const body = await res.json();
    const sample = body.quests[0];
    expect(sample.progress).toBe(0);
    expect(sample.claimed).toBe(false);
  });
});

describe('GET /api/quests/daily', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueDqp.mockReset();
  });

  it('401 unauth', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GetDaily();
    expect(res.status).toBe(401);
  });

  it('returns today\'s quest with default progress when never started', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueDqp.mockResolvedValue(null);
    const res = await GetDaily();
    const body = await res.json();
    expect(body.progress).toBe(0);
    expect(body.completed).toBe(false);
    expect(body.quest).toBeTruthy();
  });
});

describe('POST /api/quests/daily (claim)', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueDqp.mockReset();
    findUniqueQp.mockReset();
    findUniqueQp.mockResolvedValue(null);
    updateManyDqp.mockReset();
  });

  it('401 unauth', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await PostDaily();
    expect(res.status).toBe(401);
  });

  it('returns 400 when no progress', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyDqp.mockResolvedValue({ count: 0 });
    findUniqueDqp.mockResolvedValue(null);
    const res = await PostDaily();
    expect(res.status).toBe(400);
  });

  it('returns 409 already claimed', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    updateManyDqp.mockResolvedValue({ count: 0 });
    findUniqueDqp.mockResolvedValue({ completed: true, claimed: true, questId: 'discard-10' });
    const res = await PostDaily();
    expect(res.status).toBe(409);
  });
});

describe('POST /api/quests/track-ui', () => {
  beforeEach(() => fakeAuth.mockReset());

  function req(body: unknown): Request {
    return new Request('http://test/api/quests/track-ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('401 unauth', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await PostTrackUI(req({ hook: 'ui.collection.opened' }) as never);
    expect(res.status).toBe(401);
  });

  it('400 on unknown hook', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await PostTrackUI(req({ hook: 'evil.hack.attempt' }) as never);
    expect(res.status).toBe(400);
  });

  it('200 on allowed hook', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await PostTrackUI(req({ hook: 'ui.collection.opened' }) as never);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/boosters/inventory', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findManyInventory.mockReset();
  });

  it('401 unauth', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GetInventory();
    expect(res.status).toBe(401);
  });

  it('returns inventory + totalUnopened', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findManyInventory.mockResolvedValue([{ setId: 'KS', count: 3 }]);
    const res = await GetInventory();
    const body = await res.json();
    expect(body.inventory).toBeDefined();
    expect(body.totalUnopened).toBe(3);
    const ks = body.inventory.find((b: { setId: string }) => b.setId === 'KS');
    expect(ks.count).toBe(3);
  });

  it('zero inventory returns 0 total', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findManyInventory.mockResolvedValue([]);
    const res = await GetInventory();
    const body = await res.json();
    expect(body.totalUnopened).toBe(0);
  });
});
