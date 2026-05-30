import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueQp = vi.fn();
const createQp = vi.fn();
const updateQp = vi.fn();
const findUniqueDqp = vi.fn();
const createDqp = vi.fn();
const updateDqp = vi.fn();
const findUniqueDqa = vi.fn();

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

import { persistQuestProgress } from '@/lib/quests/persistProgress';

describe('persistQuestProgress', () => {
  beforeEach(() => {
    findUniqueQp.mockReset();
    createQp.mockReset();
    updateQp.mockReset();
    findUniqueDqp.mockReset();
    createDqp.mockReset();
    updateDqp.mockReset();
    findUniqueDqa.mockReset();
  });

  it('returns empty for empty userId', async () => {
    const r = await persistQuestProgress('card.discarded', '', { gameMode: 'ranked' });
    expect(r).toEqual([]);
  });

  it('skips persistence in solo_v_self mode', async () => {
    const r = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'solo_v_self' });
    expect(r).toEqual([]);
    expect(findUniqueQp).not.toHaveBeenCalled();
  });

  it('does NOT persist for ai mode (UI events only, no DB write)', async () => {
    const r = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ai' });
    expect(r).toEqual([]);
    expect(findUniqueQp).not.toHaveBeenCalled();
  });

  it('does NOT persist for hotseat mode', async () => {
    const r = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'hotseat' });
    expect(r).toEqual([]);
  });

  it('persists for ranked mode', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);
    const r = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked' });
    expect(r.length).toBeGreaterThan(0);
    expect(createQp).toHaveBeenCalled();
  });

  it('creates new progress row when none exists', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 5 });
    expect(createQp).toHaveBeenCalled();
    const createArgs = createQp.mock.calls[0][0];
    expect(createArgs.data.progress).toBe(5);
    expect(createArgs.data.userId).toBe('u1');
  });

  it('increments existing progress row', async () => {
    findUniqueQp.mockResolvedValue({
      progress: 8,
      target: 10,
      completed: false,
      claimed: false,
      completedAt: null,
    });
    updateQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 });
    expect(updateQp).toHaveBeenCalled();
    const args = updateQp.mock.calls[0][0];
    expect(args.data.progress).toBe(9);
    expect(args.data.completed).toBe(false);
  });

  it('marks completed when progress reaches target', async () => {
    findUniqueQp.mockResolvedValue({
      progress: 9,
      target: 10,
      completed: false,
      claimed: false,
      completedAt: null,
    });
    updateQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 });
    expect(updateQp).toHaveBeenCalled();
    const args = updateQp.mock.calls[0][0];
    expect(args.data.progress).toBe(10);
    expect(args.data.completed).toBe(true);
    expect(args.data.completedAt).toBeInstanceOf(Date);
  });

  it('caps progress at target (never overshoot)', async () => {
    findUniqueQp.mockResolvedValue({
      progress: 9,
      target: 10,
      completed: false,
      claimed: false,
      completedAt: null,
    });
    updateQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 50 });
    const args = updateQp.mock.calls[0][0];
    expect(args.data.progress).toBe(10);
  });

  it('does not update once claimed (idempotent skip)', async () => {
    findUniqueQp.mockResolvedValue({
      progress: 10,
      target: 10,
      completed: true,
      claimed: true,
      completedAt: new Date(),
    });
    findUniqueDqa.mockResolvedValue(null);
    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked' });
    expect(updateQp).not.toHaveBeenCalled();
    expect(createQp).not.toHaveBeenCalled();
  });

  it('updates daily quest if today matches the hook', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue({ questId: 'discard-10' });
    findUniqueDqp.mockResolvedValue(null);
    createDqp.mockResolvedValue({});

    const r = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 });
    expect(createDqp).toHaveBeenCalled();
    expect(r.some((p) => p.questId.startsWith('daily:'))).toBe(true);
  });

  it('does not double-update daily for the same hook (different quest)', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue({ questId: 'discard-50' });
    findUniqueDqp.mockResolvedValue({
      questId: 'discard-50',
      progress: 5,
      target: 50,
      completed: false,
      claimed: false,
      completedAt: null,
    });
    updateDqp.mockResolvedValue({});

    await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 });
    expect(updateDqp).toHaveBeenCalled();
  });
});
