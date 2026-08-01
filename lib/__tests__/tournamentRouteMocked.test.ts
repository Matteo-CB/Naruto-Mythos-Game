import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const mock = {
    tournament: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    tournamentParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    tournamentMatch: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    bannedCard: { findMany: vi.fn() },
    deck: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userBan: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: mock };
});

vi.mock('@/lib/sealed/boosterGenerator', () => ({
  generateSealedPool: vi.fn(() => ({ boosters: [], allCards: [] })),
}));

import { prisma } from '@/lib/db/prisma';
import { executeTournamentStart } from '../tournament/startLogic';

const p = prisma as unknown as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  tournamentMatch: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  bannedCard: { findMany: ReturnType<typeof vi.fn> };
  deck: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  userBan: { findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  for (const model of Object.values(p)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    } else if (typeof model === 'function') {
      (model as ReturnType<typeof vi.fn>).mockReset();
    }
  }
  p.tournamentMatch.findFirst.mockResolvedValue(null);
  p.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.createMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.create.mockResolvedValue({});
  p.tournamentParticipant.update.mockResolvedValue({});
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
  p.tournament.update.mockResolvedValue({});
  p.tournament.updateMany.mockResolvedValue({ count: 1 });
  p.bannedCard.findMany.mockResolvedValue([]);
});

describe('executeTournamentStart with mocked Prisma', () => {
  it('returns 404 when tournament not found', async () => {
    p.tournament.findUnique.mockResolvedValue(null);
    const result = await executeTournamentStart('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/not found/i);
    }
  });

  it('returns 400 when tournament status is not registration', async () => {
    p.tournament.updateMany.mockResolvedValue({ count: 0 });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'in_progress', participants: [], format: 'swiss',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
    });
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns 400 when fewer than 2 valid participants', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: [{ id: 'p1', userId: 'u1', deckId: null, deckValid: false, eliminated: false }],
    });
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/at least 2/i);
    }
  });

  it('starts an elimination tournament with a non-power-of-2 count, using byes', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'elimination',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, userId: `u${i}`, username: `P${i}`, seed: null,
        deckId: `d${i}`, deckValid: true, eliminated: false, sealedPool: null,
      })),
    });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id.replace('d', 'u'),
      cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    }));
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(true);
  });

  it('filters eliminated participants before count check', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'elimination',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: true, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
      ],
    });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id.replace('d', 'u'),
      cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    }));
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least 2/i);
    }
  });

  it('cleans partial bracket from prior crash before retrying', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
      ],
    });
    p.tournamentMatch.findFirst.mockResolvedValueOnce({ id: 'leftover' });
    p.tournamentMatch.deleteMany.mockResolvedValue({ count: 3 });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id.replace('d', 'u'),
      cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    }));
    const result = await executeTournamentStart('t1');
    expect(p.tournamentMatch.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1' } });
    expect(result.ok).toBe(true);
  });

  it('freezes the global banlist into bannedCardIds when useBanList is true', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss',
      gameMode: 'classic', useBanList: true, bannedCardIds: ['KS-002-UC'],
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
      ],
    });
    p.bannedCard.findMany.mockResolvedValue([{ cardId: 'KS-099-C' }, { cardId: 'KS-100-C' }]);
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id.replace('d', 'u'),
      cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    }));
    await executeTournamentStart('t1');
    const freezeCall = p.tournament.update.mock.calls.find((c: unknown[]) =>
      ((c[0] as { data?: { useBanList?: boolean } }).data?.useBanList === false),
    );
    expect(freezeCall).toBeTruthy();
    const merged = (freezeCall![0] as { data: { bannedCardIds: string[] } }).data.bannedCardIds;
    expect(new Set(merged)).toEqual(new Set(['KS-002-UC', 'KS-099-C', 'KS-100-C']));
  });

  it('marks invalid-deck participants as eliminated before bracket gen (non-sealed)', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p3', userId: 'u3', username: 'P3', seed: null, deckId: null, deckValid: false, eliminated: false, sealedPool: null },
      ],
    });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id.replace('d', 'u'),
      cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    }));
    await executeTournamentStart('t1');
    const eliminatedCalls = p.tournamentParticipant.update.mock.calls.filter((c: unknown[]) =>
      ((c[0] as { data?: { eliminated?: boolean } }).data?.eliminated === true),
    );
    expect(eliminatedCalls.length).toBe(1);
    expect((eliminatedCalls[0]![0] as { where: { id: string } }).where.id).toBe('p3');
  });

  it('rejects deck owned by a different user (catches stolen deckId)', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss',
      gameMode: 'classic', useBanList: false, bannedCardIds: [],
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
      ],
    });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'd1') {
        return {
          id: 'd1', userId: 'someone-else',
          cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
        };
      }
      return {
        id: where.id, userId: where.id.replace('d', 'u'),
        cardIds: Array(30).fill('KS-001-C'), missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
      };
    });
    await executeTournamentStart('t1');
    const p1Update = p.tournamentParticipant.update.mock.calls.find((c: unknown[]) =>
      ((c[0] as { where: { id: string } }).where.id === 'p1' && (c[0] as { data?: { deckValid?: boolean } }).data?.deckValid === false),
    );
    expect(p1Update).toBeTruthy();
  });
});
