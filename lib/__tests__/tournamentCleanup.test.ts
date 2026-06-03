import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const deleteMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: {
      findMany: (...a: unknown[]) => findMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

import { cleanupOldTournaments, TOURNAMENT_RETENTION_MS } from '@/lib/tournament/cleanupOldTournaments';

beforeEach(() => {
  findMany.mockReset();
  deleteMany.mockReset();
});

const NOW = Date.UTC(2026, 5, 3, 12, 0, 0);

describe('cleanupOldTournaments', () => {
  it('returns zero counts when no candidates match', async () => {
    findMany.mockResolvedValue([]);
    const r = await cleanupOldTournaments(NOW);
    expect(r.deleted).toBe(0);
    expect(r.byStatus).toEqual({});
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('queries the four eligibility branches with a 24h cutoff', async () => {
    findMany.mockResolvedValue([]);
    await cleanupOldTournaments(NOW);

    const arg = findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };
    expect(arg.where.OR).toHaveLength(4);

    const completed = arg.where.OR[0] as { status: string; completedAt: { lt: Date } };
    expect(completed.status).toBe('completed');
    expect(completed.completedAt.lt.getTime()).toBe(NOW - TOURNAMENT_RETENTION_MS);

    const cancelled = arg.where.OR[1] as { status: string; createdAt: { lt: Date } };
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.createdAt.lt.getTime()).toBe(NOW - TOURNAMENT_RETENTION_MS);

    const pending = arg.where.OR[2] as { status: string; createdAt: { lt: Date }; OR: Array<unknown> };
    expect(pending.status).toBe('pending');
    expect(pending.createdAt.lt.getTime()).toBe(NOW - TOURNAMENT_RETENTION_MS);
    expect(pending.OR).toHaveLength(2);

    const inProgress = arg.where.OR[3] as { status: string; createdAt: { lt: Date } };
    expect(inProgress.status).toBe('in_progress');
    expect(inProgress.createdAt.lt.getTime()).toBe(NOW - TOURNAMENT_RETENTION_MS);
  });

  it('counts by status and forwards the delete to prisma', async () => {
    findMany.mockResolvedValue([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'completed' },
      { id: 'c', status: 'cancelled' },
      { id: 'd', status: 'pending' },
      { id: 'e', status: 'in_progress' },
    ]);
    deleteMany.mockResolvedValue({ count: 5 });

    const r = await cleanupOldTournaments(NOW);

    expect(r.deleted).toBe(5);
    expect(r.byStatus).toEqual({
      completed: 2,
      cancelled: 1,
      pending: 1,
      in_progress: 1,
    });
    const delArg = deleteMany.mock.calls[0][0] as { where: { id: { in: string[] } } };
    expect(delArg.where.id.in).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('uses Date.now() when no argument is passed', async () => {
    findMany.mockResolvedValue([]);
    await cleanupOldTournaments();
    expect(findMany).toHaveBeenCalled();
  });
});
