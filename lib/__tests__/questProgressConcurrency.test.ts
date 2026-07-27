import { describe, it, expect, vi, beforeEach } from 'vitest';

interface QuestRow {
  userId: string;
  questId: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  completedAt: Date | null;
}

const questRows = new Map<string, QuestRow>();
const createCalls: unknown[] = [];
let uniqueViolations = 0;
let ghostWriteAfterRead: ((userId: string, questId: string) => void) | null = null;

function rowKey(userId: string, questId: string): string {
  return `${userId}:${questId}`;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeUniqueViolation extends Error {
  code = 'P2002';
  constructor() {
    super('Unique constraint failed on the constraint: `QuestProgress_userId_questId_key`');
  }
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    questProgress: {
      findUnique: async ({ where }: { where: { userId_questId: { userId: string; questId: string } } }) => {
        await settle();
        const { userId, questId } = where.userId_questId;
        const row = questRows.get(rowKey(userId, questId)) ?? null;
        if (ghostWriteAfterRead) {
          const write = ghostWriteAfterRead;
          ghostWriteAfterRead = null;
          write(userId, questId);
        }
        return row;
      },
      create: async ({ data }: { data: QuestRow }) => {
        createCalls.push(data);
        await settle();
        const key = rowKey(data.userId, data.questId);
        if (questRows.has(key)) {
          uniqueViolations += 1;
          throw new FakeUniqueViolation();
        }
        questRows.set(key, { ...data, claimed: false });
        return data;
      },
      update: async ({ where, data }: {
        where: { userId_questId: { userId: string; questId: string } };
        data: Partial<QuestRow>;
      }) => {
        await settle();
        const key = rowKey(where.userId_questId.userId, where.userId_questId.questId);
        const existing = questRows.get(key);
        if (!existing) throw new Error('row missing');
        questRows.set(key, { ...existing, ...data });
        return questRows.get(key);
      },
    },
    dailyQuestProgress: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
    dailyQuestAssignment: {
      findUnique: async () => null,
    },
  },
}));

import { persistQuestProgress } from '@/lib/quests/persistProgress';

describe('quest progress under concurrent events for the same user', () => {
  beforeEach(() => {
    questRows.clear();
    createCalls.length = 0;
    uniqueViolations = 0;
    ghostWriteAfterRead = null;
  });

  it('recovers when another writer inserts the row between the read and the create', async () => {
    let racedQuestId = '';
    ghostWriteAfterRead = (userId, questId) => {
      racedQuestId = questId;
      questRows.set(rowKey(userId, questId), {
        userId,
        questId,
        progress: 4,
        target: 10,
        completed: false,
        claimed: false,
        completedAt: null,
      });
    };

    const persisted = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 });

    expect(uniqueViolations).toBe(1);
    expect(questRows.get(rowKey('u1', racedQuestId))!.progress).toBe(5);
    expect(persisted.some((p) => p.questId === racedQuestId && p.newProgress === 5)).toBe(true);
  });

  it('counts every event of a burst instead of losing all but one', async () => {
    const burst = Array.from({ length: 5 }, () =>
      persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 }));
    await Promise.all(burst);

    const row = questRows.get(rowKey('u1', 'discard-10'));
    expect(row).toBeDefined();
    expect(row!.progress).toBe(5);
  });

  it('creates each row exactly once so no unique violation is ever thrown', async () => {
    await Promise.all(Array.from({ length: 8 }, () =>
      persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 })));

    const created = createCalls as QuestRow[];
    const perQuest = new Map<string, number>();
    for (const row of created) {
      perQuest.set(row.questId, (perQuest.get(row.questId) ?? 0) + 1);
    }
    for (const [, count] of perQuest) expect(count).toBe(1);
    expect(perQuest.size).toBe(created.length);
    expect(uniqueViolations).toBe(0);
  });

  it('merges instead of throwing when another writer already created the row', async () => {
    questRows.set(rowKey('u1', 'discard-10'), {
      userId: 'u1',
      questId: 'discard-10',
      progress: 3,
      target: 10,
      completed: false,
      claimed: false,
      completedAt: null,
    });

    const persisted = await persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 2 });
    const row = questRows.get(rowKey('u1', 'discard-10'));
    expect(row!.progress).toBe(5);
    expect(persisted.some((p) => p.questId === 'discard-10')).toBe(true);
  });

  it('keeps progress independent per user', async () => {
    await Promise.all([
      persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 }),
      persistQuestProgress('card.discarded', 'u2', { gameMode: 'ranked', delta: 1 }),
      persistQuestProgress('card.discarded', 'u1', { gameMode: 'ranked', delta: 1 }),
    ]);

    expect(questRows.get(rowKey('u1', 'discard-10'))!.progress).toBe(2);
    expect(questRows.get(rowKey('u2', 'discard-10'))!.progress).toBe(1);
  });
});
