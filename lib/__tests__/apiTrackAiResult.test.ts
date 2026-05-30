import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUniqueQp = vi.fn();
const createQp = vi.fn();
const updateQp = vi.fn();
const findUniqueDqa = vi.fn();
const findUniqueDqp = vi.fn();
const createDqp = vi.fn();
const updateDqp = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    questProgress: {
      findUnique: (...a: unknown[]) => findUniqueQp(...a),
      create: (...a: unknown[]) => createQp(...a),
      update: (...a: unknown[]) => updateQp(...a),
    },
    dailyQuestProgress: {
      findUnique: (...a: unknown[]) => findUniqueDqp(...a),
      create: (...a: unknown[]) => createDqp(...a),
      update: (...a: unknown[]) => updateDqp(...a),
    },
    dailyQuestAssignment: {
      findUnique: (...a: unknown[]) => findUniqueDqa(...a),
    },
  },
}));

import { POST } from '@/app/api/quests/track-ai-result/route';

function req(body: unknown): Request {
  return new Request('http://test/api/quests/track-ai-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

describe('POST /api/quests/track-ai-result', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueQp.mockReset();
    createQp.mockReset();
    updateQp.mockReset();
    findUniqueDqa.mockReset();
    findUniqueDqp.mockReset();
    createDqp.mockReset();
    updateDqp.mockReset();
  });

  it('401 unauth', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(req({ difficulty: 'easy', result: 'played' }) as never);
    expect(res.status).toBe(401);
  });

  it('400 invalid difficulty', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(req({ difficulty: 'godmode', result: 'played' }) as never);
    expect(res.status).toBe(400);
  });

  it('400 invalid result', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(req({ difficulty: 'easy', result: 'tied' }) as never);
    expect(res.status).toBe(400);
  });

  it('200 fires match.played.ai (and persists for AI-specific hooks)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    const res = await POST(req({ difficulty: 'easy', result: 'played' }) as never);
    expect(res.status).toBe(200);
    await flush();

    const createdIds = createQp.mock.calls.map((c) => (c[0] as { data: { questId: string } }).data.questId);
    expect(createdIds).toContain('ai-easy-play-1');
  });

  it('won with streak >= 3 progresses medium-streak quest', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    const res = await POST(req({ difficulty: 'medium', result: 'won', streak: 4 }) as never);
    expect(res.status).toBe(200);
    await flush();

    const createdIds = createQp.mock.calls.map((c) => (c[0] as { data: { questId: string } }).data.questId);
    expect(createdIds).toContain('ai-medium-streak-3');
  });

  it('won with streak < 3 does NOT progress streak quest', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    const res = await POST(req({ difficulty: 'medium', result: 'won', streak: 1 }) as never);
    expect(res.status).toBe(200);
    await flush();

    const createdIds = createQp.mock.calls.map((c) => (c[0] as { data: { questId: string } }).data.questId);
    expect(createdIds).not.toContain('ai-medium-streak-3');
  });

  it('AI mode persistence is allowed for match.played.ai (override)', async () => {
    const { persistQuestProgress } = await import('@/lib/quests/persistProgress');
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    await persistQuestProgress('match.played.ai', 'u1', { gameMode: 'ai', difficulty: 'easy' });
    expect(createQp).toHaveBeenCalled();
  });

  it('AI mode persistence skipped for generic hooks (card.discarded)', async () => {
    const { persistQuestProgress } = await import('@/lib/quests/persistProgress');
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ai' });
    expect(createQp).not.toHaveBeenCalled();
  });
});
