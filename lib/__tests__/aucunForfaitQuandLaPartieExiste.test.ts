import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    tournamentMatch: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    deck: { findUnique: vi.fn() },
    $runCommandRaw: vi.fn(),
  };
  return { prisma: m };
});

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  getSocketIO: vi.fn(() => null),
}));

const timersArretes: string[] = [];
vi.mock('@/lib/tournament/absenceManager', () => {
  const timers = new Map<string, () => Promise<void>>();
  return {
    startAbsenceTimer: vi.fn((matchId: string, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
      return new Date(Date.now() + 120_000);
    }),
    clearAbsenceTimer: vi.fn((matchId: string) => {
      timersArretes.push(matchId);
      timers.delete(matchId);
    }),
    scheduleAbsenceTimerWithDeadline: vi.fn((matchId: string, _d: Date, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
    }),
    ABSENCE_TIMEOUT_MS: 120_000,
  };
});

vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn() }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({ finalizeAndScheduleRoomDeletion: vi.fn() }));
vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));

const evenements: Array<{ type: string; matchId?: string }> = [];
vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn((ev: { type: string; matchId?: string }) => { evenements.push(ev); }),
}));

import { prisma } from '@/lib/db/prisma';
import { fireAbsenceTimerCallback, handleTournamentMatchEnd } from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentParticipant: { updateMany: ReturnType<typeof vi.fn> };
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  $runCommandRaw: ReturnType<typeof vi.fn>;
};

interface FakeIo {
  emissions: Array<{ room: string; event: string; data: unknown }>;
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function fakeIo(tournamentId: string, connectes: string[]): FakeIo {
  const emissions: FakeIo['emissions'] = [];
  const sockets = new Map<string, { data: { userId?: string }; rooms: Set<string> }>();
  connectes.forEach((uid, idx) => {
    sockets.set(`sock-${idx}`, { data: { userId: uid }, rooms: new Set([`tournament:${tournamentId}`]) });
  });
  return Object.assign(
    {
      emissions,
      to(room: string) {
        return { emit: (event: string, data: unknown) => emissions.push({ room, event, data }) };
      },
    },
    { sockets: { sockets } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  evenements.length = 0;
  timersArretes.length = 0;
  p.tournament.findUnique.mockReset();
  p.tournament.update.mockReset();
  p.tournamentParticipant.updateMany.mockReset();
  p.tournamentMatch.findUnique.mockReset();
  p.tournamentMatch.findMany.mockReset();
  p.tournamentMatch.update.mockReset();
  p.tournamentMatch.updateMany.mockReset();
  p.$runCommandRaw.mockResolvedValue({});
});

describe('un match dont la partie a demarre ne peut plus etre perdu pour absence', () => {
  it('annule le forfait des qu une partie est rattachee au match, meme si personne ne semble connecte', async () => {
    const io = fakeIo('t1', []);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', status: 'in_progress', roomCode: 'ABC123', gameId: 'game-1',
      player1Id: 'p1', player2Id: 'p2', round: 1, matchIndex: 0, bracket: null,
    });
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination' });
    p.tournamentMatch.update.mockResolvedValue({});

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', 'p2', false);

    expect(p.tournamentMatch.update, 'aucune ecriture de forfait').not.toHaveBeenCalled();
    expect(io.emissions.some((e) => e.event === 'tournament:player-forfeited')).toBe(false);
    expect(timersArretes, 'le compte a rebours est arrete pour de bon').toContain('m1');
  });

  it('laisse le forfait partir quand le match n a pas encore de partie', async () => {
    const io = fakeIo('t1', ['p1']);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm2', tournamentId: 't1', status: 'ready', roomCode: null, gameId: null,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      round: 1, matchIndex: 0, bracket: null,
    });
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination' });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([]);

    await fireAbsenceTimerCallback(io as never, 't1', 'm2', 'p1', 'p2', 'p2', false);

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'forfeit', winnerId: 'p1' }),
    }));
  });
});

describe('un resultat reellement joue passe devant un forfait deja inscrit', () => {
  it('corrige le match, rend le vainqueur non elimine et journalise la correction', async () => {
    const io = fakeIo('t1', []);
    p.tournamentMatch.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args?.where?.id === 'm3') {
        return {
          id: 'm3', tournamentId: 't1', status: 'forfeit', roomCode: 'ABC123', gameId: null,
          player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
          player1GameWins: 0, player2GameWins: 0, isBye: false,
          round: 1, matchIndex: 0, bracket: null,
        };
      }
      return null;
    });
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination', bestOf: 1, totalRounds: 1, status: 'in_progress' });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([]);

    await handleTournamentMatchEnd(io as never, 't1', 'm3', 'p2', 'game-9');

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm3' },
      data: expect.objectContaining({ status: 'completed', winnerId: 'p2' }),
    }));
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'p2' }),
      data: expect.objectContaining({ eliminated: false }),
    }));
    expect(evenements.map((e) => e.type)).toContain('match.forfeit.overridden');
  });

  it('ne rejoue rien sur un match deja termine normalement', async () => {
    const io = fakeIo('t1', []);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm4', tournamentId: 't1', status: 'completed', winnerId: 'p1',
      player1Id: 'p1', player2Id: 'p2', round: 1, matchIndex: 0, bracket: null,
    });

    await handleTournamentMatchEnd(io as never, 't1', 'm4', 'p2', 'game-10');

    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
    expect(evenements.map((e) => e.type)).not.toContain('match.forfeit.overridden');
  });
});
