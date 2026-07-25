import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournamentParticipant: { findMany: (...a: unknown[]) => findMany(...a) },
    deck: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

vi.mock('@/lib/data/cardIndex', () => ({
  getCharacterById: (id: string) => (id.startsWith('KS-') ? { id } : undefined),
  getMissionById: (id: string) => (id.startsWith('MSS') ? { id } : undefined),
}));


import { confirmedDecklessSeats, pickDoubleAbsenceLoser } from '@/lib/tournament/matchRulings';

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
});

describe('double absence in bracket play: the better seed advances', () => {
  it('forfeits the worse seed so the better seed goes through', async () => {
    findMany.mockResolvedValue([
      { userId: 'strong', seed: 2 },
      { userId: 'weak', seed: 9 },
    ]);
    expect(await pickDoubleAbsenceLoser('t1', 'strong', 'weak')).toBe('weak');
    expect(await pickDoubleAbsenceLoser('t1', 'weak', 'strong')).toBe('weak');
  });

  it('treats a missing seed as the worst possible seed', async () => {
    findMany.mockResolvedValue([{ userId: 'seeded', seed: 4 }, { userId: 'unseeded', seed: null }]);
    expect(await pickDoubleAbsenceLoser('t1', 'seeded', 'unseeded')).toBe('unseeded');
  });

  it('never stalls the bracket: always names exactly one loser, even on equal seeds', async () => {
    findMany.mockResolvedValue([{ userId: 'a', seed: 3 }, { userId: 'b', seed: 3 }]);
    const loser = await pickDoubleAbsenceLoser('t1', 'a', 'b');
    expect(['a', 'b']).toContain(loser);
  });

  it('falls back to a decision instead of throwing when the lookup fails', async () => {
    findMany.mockRejectedValue(new Error('mongo down'));
    expect(await pickDoubleAbsenceLoser('t1', 'a', 'b')).toBe('a');
  });
});

describe('a player who lost the deck they registered with forfeits', () => {
  it('reports the seat whose deck row no longer exists', async () => {
    findMany.mockResolvedValue([
      { userId: 'ok', deckId: 'deck-ok' },
      { userId: 'gone', deckId: 'deck-gone' },
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'deck-ok' ? { id: 'deck-ok', userId: 'ok', cardIds: ['KS-001-C'], missionIds: ['MSS-01'] } : null);
    expect(await confirmedDecklessSeats('t1', 'ok', 'gone')).toEqual(['gone']);
  });

  it('reports a seat whose registered deck now belongs to someone else', async () => {
    findMany.mockResolvedValue([{ userId: 'thief', deckId: 'deck-x' }]);
    findUnique.mockResolvedValue({ id: 'deck-x', userId: 'someone-else', cardIds: ['KS-001-C'], missionIds: ['MSS-01'] });
    expect(await confirmedDecklessSeats('t1', 'thief', null)).toEqual(['thief']);
  });

  it('reports a seat whose deck was emptied', async () => {
    findMany.mockResolvedValue([{ userId: 'empty', deckId: 'deck-e' }]);
    findUnique.mockResolvedValue({ id: 'deck-e', userId: 'empty', cardIds: [], missionIds: [] });
    expect(await confirmedDecklessSeats('t1', 'empty', null)).toEqual(['empty']);
  });

  it('never punishes a player whose deck is intact', async () => {
    findMany.mockResolvedValue([
      { userId: 'p1', deckId: 'd1' },
      { userId: 'p2', deckId: 'd2' },
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id === 'd1' ? 'p1' : 'p2', cardIds: ['KS-001-C'], missionIds: ['MSS-01'],
    }));
    expect(await confirmedDecklessSeats('t1', 'p1', 'p2')).toEqual([]);
  });

  it('never punishes a player who is not a participant of that tournament', async () => {
    findMany.mockResolvedValue([]);
    expect(await confirmedDecklessSeats('t1', 'ghost', 'other')).toEqual([]);
  });
});
