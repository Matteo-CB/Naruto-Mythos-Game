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

  it('aucune branche ne fait vieillir un tournoi depuis sa creation quand il a une date de depart', async () => {
    findMany.mockResolvedValue([]);
    await cleanupOldTournaments(NOW);

    const arg = findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };
    const limite = NOW - TOURNAMENT_RETENTION_MS;

    for (const branche of arg.where.OR) {
      const parCreation = branche.createdAt as { lt: Date } | undefined;
      if (!parCreation) continue;
      expect(
        branche.scheduledStartAt,
        `la branche ${JSON.stringify(branche.status)} vieillit depuis la creation, elle doit exiger l absence de date de depart`,
      ).toBeNull();
    }

    const termine = arg.where.OR.find((b) => b.status === 'completed') as { completedAt: { lt: Date } };
    expect(termine.completedAt.lt.getTime(), 'un tournoi termine vieillit depuis sa fin').toBe(limite);

    const enCours = arg.where.OR.find((b) => b.status === 'in_progress') as { startedAt: { lt: Date }; createdAt?: unknown };
    expect(enCours.createdAt, 'un tournoi en cours ne vieillit jamais depuis sa creation').toBeUndefined();
    expect(enCours.startedAt.lt.getTime(), 'il vieillit depuis son demarrage reel').toBe(limite);

    const annules = arg.where.OR.filter((b) => b.status === 'cancelled');
    expect(annules.length, 'plusieurs facons de dater une annulation').toBeGreaterThan(1);
    const annuleDate = annules.find((b) => b.completedAt && typeof b.completedAt === 'object') as { completedAt: { lt: Date } };
    expect(annuleDate.completedAt.lt.getTime(), 'une annulation datee vieillit depuis cette date').toBe(limite);
  });

  it('un tournoi ouvert vingt quatre heures avant son depart ne peut pas etre efface avant d avoir eu lieu', async () => {
    findMany.mockResolvedValue([]);
    await cleanupOldTournaments(NOW);
    const arg = findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };

    const enInscription = arg.where.OR.filter((b) => b.status === 'registration');
    expect(enInscription, 'ce nettoyage court ne touche jamais un tournoi encore ouvert').toEqual([]);

    for (const branche of arg.where.OR) {
      const depart = branche.scheduledStartAt as { lt?: Date } | null | undefined;
      if (!depart || typeof depart !== 'object' || !depart.lt) continue;
      expect(
        depart.lt.getTime(),
        'un tournoi date ne part qu une fois sa date de depart passee depuis assez longtemps',
      ).toBe(NOW - TOURNAMENT_RETENTION_MS);
    }
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
