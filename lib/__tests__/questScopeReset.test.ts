import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const questProgress = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const dailyQuestAssignment = { findUnique: vi.fn() };
  const dailyQuestProgress = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  return { prisma: { questProgress, dailyQuestAssignment, dailyQuestProgress } };
});

import { prisma } from '@/lib/db/prisma';
import { persistQuestProgress, __resetScopedProgressForTests } from '@/lib/quests/persistProgress';

describe('scope: match — in-memory accumulator resets across matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetScopedProgressForTests();
    (prisma.questProgress.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.questProgress.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.questProgress.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.dailyQuestAssignment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('accumulates progress within the same match', async () => {
    for (let i = 0; i < 4; i++) {
      await persistQuestProgress('character.played', 'user-x', {
        gameMode: 'ranked',
        matchKey: 'game-A',
      });
    }
    expect(prisma.questProgress.create).not.toHaveBeenCalled();
    await persistQuestProgress('character.played', 'user-x', {
      gameMode: 'ranked',
      matchKey: 'game-A',
    });
    expect(prisma.questProgress.create).toHaveBeenCalledTimes(1);
    const call = (prisma.questProgress.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.questId).toBe('play-5-characters-in-match');
    expect(call.data.progress).toBe(5);
    expect(call.data.completed).toBe(true);
  });

  it('resets when matchKey changes (3 plays in game-A then 3 in game-B should NOT complete play-5)', async () => {
    for (let i = 0; i < 3; i++) {
      await persistQuestProgress('character.played', 'user-y', {
        gameMode: 'ranked',
        matchKey: 'game-A',
      });
    }
    for (let i = 0; i < 3; i++) {
      await persistQuestProgress('character.played', 'user-y', {
        gameMode: 'ranked',
        matchKey: 'game-B',
      });
    }
    expect(prisma.questProgress.create).not.toHaveBeenCalled();
  });

  it('completes when 5 plays happen in a single match (matchKey identical)', async () => {
    for (let i = 0; i < 5; i++) {
      await persistQuestProgress('character.played', 'user-z', {
        gameMode: 'ranked',
        matchKey: 'game-C',
      });
    }
    expect(prisma.questProgress.create).toHaveBeenCalledTimes(1);
    const call = (prisma.questProgress.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.completed).toBe(true);
  });
});

describe('scope: cumulative — accumulates across matches as before', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetScopedProgressForTests();
    (prisma.questProgress.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.questProgress.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.questProgress.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.dailyQuestAssignment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('persists cumulatively across matchKey changes', async () => {
    await persistQuestProgress('character.defeated', 'user-c', {
      gameMode: 'ranked',
      matchKey: 'game-A',
    });
    expect(prisma.questProgress.create).toHaveBeenCalled();
    const callIds = (prisma.questProgress.create as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0].data.questId);
    expect(callIds).toContain('defeat-100-cumulative');
  });
});
