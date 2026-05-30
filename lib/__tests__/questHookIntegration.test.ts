import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueQp = vi.fn();
const createQp = vi.fn();
const updateQp = vi.fn();
const findUniqueDqa = vi.fn();
const findUniqueDqp = vi.fn();
const createDqp = vi.fn();

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
      update: vi.fn(),
    },
    dailyQuestAssignment: {
      findUnique: (...a: unknown[]) => findUniqueDqa(...a),
    },
  },
}));

import { emitQuestEvent, clearQuestListeners, onQuestEvent } from '@/lib/quests/hooks';
import { persistQuestProgress } from '@/lib/quests/persistProgress';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('hook emission integration: emit → persistence listener → DB write', () => {
  beforeEach(() => {
    findUniqueQp.mockReset();
    createQp.mockReset();
    updateQp.mockReset();
    findUniqueDqp.mockReset();
    createDqp.mockReset();
    findUniqueDqa.mockReset();
    clearQuestListeners();
    onQuestEvent(async (hook, userId, payload) => {
      try { await persistQuestProgress(hook, userId, payload); } catch { /* test mock */ }
    });
  });

  it('emitting card.discarded for ranked mode persists progress', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'ranked' });
    await flush();

    expect(createQp).toHaveBeenCalled();
  });

  it('emitting in solo_v_self does NOT persist', async () => {
    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'solo_v_self' });
    await flush();

    expect(createQp).not.toHaveBeenCalled();
    expect(updateQp).not.toHaveBeenCalled();
  });

  it('emitting in ai mode does NOT persist', async () => {
    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'ai' });
    await flush();

    expect(createQp).not.toHaveBeenCalled();
  });

  it('emitting in hotseat mode does NOT persist', async () => {
    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'hotseat' });
    await flush();

    expect(createQp).not.toHaveBeenCalled();
  });

  it('emitting evolving win progresses match.won.evolving quests', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    emitQuestEvent('match.won.evolving', 'user-1', { gameMode: 'evolving' });
    await flush();

    expect(createQp).toHaveBeenCalled();
    const createArgs = createQp.mock.calls[0][0];
    expect(['evolving-wins-3', 'evolving-wins-10', 'evolving-wins-30']).toContain(createArgs.data.questId);
  });

  it('emitting with delta increments by delta amount', async () => {
    findUniqueQp.mockResolvedValue({
      progress: 5, target: 25, completed: false, claimed: false, completedAt: null,
    });
    updateQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'ranked', delta: 3 });
    await flush();

    expect(updateQp).toHaveBeenCalled();
    const updateArgs = updateQp.mock.calls[0][0];
    expect(updateArgs.data.progress).toBe(8);
  });

  it('emitting hooks does not throw if no userId provided', async () => {
    emitQuestEvent('card.discarded', '', { gameMode: 'ranked' });
    emitQuestEvent('card.discarded', null as unknown as string, { gameMode: 'ranked' });
    await flush();

    expect(createQp).not.toHaveBeenCalled();
  });

  it('matches predicate-bound quests only when payload matches', async () => {
    findUniqueQp.mockResolvedValue(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    emitQuestEvent('character.played.group', 'user-1', { gameMode: 'ranked', group: 'Sound Village' });
    await flush();

    const createdQuestIds = createQp.mock.calls.map((c) => (c[0] as { data: { questId: string } }).data.questId);
    expect(createdQuestIds).toContain('play-1-sound-village');
    expect(createdQuestIds).not.toContain('play-1-akatsuki');
  });

  it('multiple emits on same hook for the same user increment progress correctly', async () => {
    findUniqueQp.mockResolvedValueOnce(null);
    createQp.mockResolvedValue({});
    findUniqueDqa.mockResolvedValue(null);

    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'ranked' });
    await flush();

    findUniqueQp.mockResolvedValueOnce({
      progress: 1, target: 10, completed: false, claimed: false, completedAt: null,
    });
    updateQp.mockResolvedValue({});

    emitQuestEvent('card.discarded', 'user-1', { gameMode: 'ranked' });
    await flush();

    expect(updateQp).toHaveBeenCalled();
  });
});
