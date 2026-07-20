import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tournamentMatch: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    tournamentAdminLog: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userBan: { create: vi.fn(), deleteMany: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));
vi.mock('@/lib/socket/server', () => ({ rooms: new Map(), getSocketIO: vi.fn(() => null) }));
vi.mock('@/lib/discord/tournamentRoles', () => ({
  assignTournamentWinnerRole: vi.fn(),
  removeTournamentRole: vi.fn(),
}));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({ finalizeAndScheduleRoomDeletion: vi.fn() }));
vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));
vi.mock('@/lib/tournament/absenceManager', () => {
  const timers = new Map<string, () => Promise<void>>();
  return {
    startAbsenceTimer: vi.fn((matchId: string, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
      return new Date(Date.now() + 120_000);
    }),
    clearAbsenceTimer: vi.fn((matchId: string) => { timers.delete(matchId); }),
    scheduleAbsenceTimerWithDeadline: vi.fn((matchId: string, _d: Date, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
    }),
    ABSENCE_TIMEOUT_MS: 120_000,
    __timers: timers,
  };
});

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { fireAbsenceTimerCallback, MAX_GRACE_CYCLES } from '../socket/tournamentHandlers';
import { buildTournamentResultsView } from '../tournament/resultsView';
import { POST as adminPOST } from '../../app/api/tournaments/[id]/admin/route';
import type { TournamentData } from '@/stores/tournamentStore';

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

type Emission = { room: string; event: string; data: unknown };
interface IoMock {
  emissions: Emission[];
  sockets: { sockets: Map<string, { data: { userId?: string }; rooms: Set<string> }> };
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function makeIo(tournamentId: string, connectedUserIds: string[]): IoMock {
  const emissions: Emission[] = [];
  const socks = new Map<string, { data: { userId?: string }; rooms: Set<string> }>();
  connectedUserIds.forEach((uid, i) => {
    socks.set(`sock-${i}`, { data: { userId: uid }, rooms: new Set([`tournament:${tournamentId}`]) });
  });
  return {
    emissions,
    sockets: { sockets: socks },
    to(room: string) {
      return { emit: (event: string, data: unknown) => emissions.push({ room, event, data }) };
    },
  };
}

function makeRequest(body: object): Request {
  return new Request('http://localhost/api/tournaments/t1/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  for (const model of Object.values(p)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
  p.tournamentAdminLog.create.mockResolvedValue({});
});

describe('Tournament forfeit recovery E2E (Fix #5: combined defense)', () => {
  describe('the 2026-05-12 scenario does NOT trigger when players are connected', () => {
    it('two R3 matches fire simultaneously, all 4 players connected → 2x please-confirm + 0 forfeit', async () => {
      const io = makeIo('t1', ['Trafalgar', 'mak52554', 'legoubz', 'Mister_Mrozikk']);
      p.tournamentMatch.update.mockResolvedValue({});

      await fireAbsenceTimerCallback(io as never, 't1', 'r3m1', 'Trafalgar', 'mak52554', null, false);
      await fireAbsenceTimerCallback(io as never, 't1', 'r3m3', 'legoubz', 'Mister_Mrozikk', null, false);

      const confirmEmits = io.emissions.filter((e) => e.event === 'tournament:please-confirm-ready');
      expect(confirmEmits).toHaveLength(2);
      expect(confirmEmits.map((e) => (e.data as { matchId: string }).matchId).sort()).toEqual(['r3m1', 'r3m3']);

      expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();

      const forfeitEmits = io.emissions.filter((e) => e.event === 'tournament:player-forfeited');
      expect(forfeitEmits).toHaveLength(0);
    });

    it('only 1 player connected in match → forfeit fires for the disconnected one only', async () => {
      const io = makeIo('t1', ['Trafalgar']);
      p.tournamentMatch.findUnique.mockResolvedValue({
        id: 'r3m1', tournamentId: 't1', status: 'ready',
        player1Id: 'Trafalgar', player2Id: 'mak52554',
        player1Username: 'Trafalgar', player2Username: 'mak52554',
        round: 3, matchIndex: 1, bracket: null, roomCode: null,
      });
      p.tournament.findUnique.mockImplementation(async (args: { include?: { participants?: unknown } }) => {
        if (args?.include?.participants) {
          return { id: 't1', currentRound: 3, totalRounds: 3, status: 'in_progress', participants: [], matches: [] };
        }
        return { format: 'swiss' };
      });
      p.tournamentMatch.update.mockResolvedValue({});
      p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
      p.tournamentMatch.findMany.mockResolvedValue([]);

      await fireAbsenceTimerCallback(io as never, 't1', 'r3m1', 'Trafalgar', 'mak52554', null, false);

      expect(io.emissions.some((e) => e.event === 'tournament:please-confirm-ready')).toBe(false);
      expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'forfeit', winnerId: 'Trafalgar' }),
      }));
    });

    it('connected players get bounded grace, then forfeit only once the grace is exhausted', async () => {
      const io = makeIo('t1', ['Trafalgar', 'mak52554']);
      p.tournamentMatch.findUnique.mockResolvedValue({
        id: 'r3m1g', tournamentId: 't1', status: 'ready',
        player1Id: 'Trafalgar', player2Id: 'mak52554',
        player1Username: 'Trafalgar', player2Username: 'mak52554',
        round: 3, matchIndex: 1, bracket: null, roomCode: null,
      });
      p.tournament.findUnique.mockImplementation(async (args: { include?: { participants?: unknown } }) => {
        if (args?.include?.participants) {
          return { id: 't1', currentRound: 3, totalRounds: 3, status: 'in_progress', participants: [], matches: [] };
        }
        return { format: 'swiss' };
      });
      p.tournamentMatch.update.mockResolvedValue({});
      p.tournamentParticipant.updateMany.mockResolvedValue({ count: 2 });
      p.tournamentMatch.findMany.mockResolvedValue([{ id: 'r3m1g', status: 'forfeit', round: 3 }]);

      for (let i = 0; i < MAX_GRACE_CYCLES; i++) {
        await fireAbsenceTimerCallback(io as never, 't1', 'r3m1g', 'Trafalgar', 'mak52554', null, true);
      }
      expect(io.emissions.filter((e) => e.event === 'tournament:please-confirm-ready')).toHaveLength(MAX_GRACE_CYCLES);
      expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();

      await fireAbsenceTimerCallback(io as never, 't1', 'r3m1g', 'Trafalgar', 'mak52554', null, true);
      expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['Trafalgar', 'mak52554'] } }),
        data: expect.objectContaining({ eliminated: true }),
      }));
    });
  });

  describe('admin recovery flow restores a wrongly-completed tournament', () => {
    it('full recovery: reset forfeit match → un-eliminate players → revert tournament status → re-arm timer', async () => {
      authMock.mockResolvedValue({ user: { id: 'creator', name: 'Kutxyt' } });
      const forfeitMatch = {
        id: 'r3m1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 1,
        player1Id: 'Trafalgar', player2Id: 'mak52554',
        player1Username: 'Trafalgar', player2Username: 'mak52554',
        status: 'forfeit', winnerId: null, winnerUsername: null, isBye: false,
        roomCode: null, gameId: null,
      };
      p.tournament.findUnique.mockResolvedValue({
        id: 't1', creatorId: 'creator', status: 'completed', format: 'swiss',
        currentRound: 3, totalRounds: 3,
        winnerId: 'yclooney', winnerUsername: 'yclooney',
        gameMode: 'classic',
        matches: [forfeitMatch], participants: [],
      });
      p.tournamentMatch.update.mockResolvedValue({});
      p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
      p.tournament.update.mockResolvedValue({});
      p.user.update.mockResolvedValue({});

      const res = await adminPOST(
        makeRequest({ action: 'resetMatch', matchId: 'r3m1' }) as never,
        { params: Promise.resolve({ id: 't1' }) },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wasForfeit).toBe(true);
      expect(body.tournamentStatusReverted).toBe(true);

      expect(p.tournament.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'in_progress', winnerId: null }),
      });

      expect(p.user.update).toHaveBeenCalledWith({
        where: { id: 'yclooney' },
        data: { tournamentWins: { decrement: 1 } },
      });

      expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', userId: 'Trafalgar', eliminatedRound: 3 },
        data: { eliminated: false, eliminatedRound: null },
      });
      expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', userId: 'mak52554', eliminatedRound: 3 },
        data: { eliminated: false, eliminatedRound: null },
      });
    });

    it('rejects non-admin attempting recovery', async () => {
      authMock.mockResolvedValue({ user: { id: 'random-user', name: 'random' } });
      p.tournament.findUnique.mockResolvedValue({
        id: 't1', creatorId: 'someone-else', status: 'completed', format: 'swiss',
        matches: [], participants: [],
      });

      const res = await adminPOST(
        makeRequest({ action: 'resetMatch', matchId: 'r3m1' }) as never,
        { params: Promise.resolve({ id: 't1' }) },
      );
      expect(res.status).toBe(403);
    });
  });

  describe('results view stays meaningful through the full forfeit/recovery cycle', () => {
    function makeTournament(): TournamentData {
      return {
        id: 't1', name: 'Tournament 1', type: 'simulator', status: 'completed',
        gameMode: 'classic', maxPlayers: 8, currentRound: 3, totalRounds: 3,
        isPublic: true, joinCode: null, creatorId: 'creator', creatorUsername: 'creator',
        requiresDiscord: false, useBanList: false, sealedBoosterCount: null,
        sealedSetChoice: null, discordRoleReward: null, bannedCardIds: [], allowedLeagues: [],
        format: 'swiss', winnerId: 'yclooney', winnerUsername: 'yclooney',
        participants: [], matches: [], createdAt: new Date().toISOString(),
      };
    }

    it('after mass-forfeit, results view shows double-forfeit matches with both names', () => {
      const t: TournamentData = {
        ...makeTournament(),
        matches: [
          { id: 'r1m0', tournamentId: 't1', bracket: 'main', round: 1, matchIndex: 0, player1Id: 'p_yass', player2Id: 'p_traf', player1Username: 'yass_1613', player2Username: 'Trafalgar', winnerId: 'p_traf', winnerUsername: 'Trafalgar', isBye: false, status: 'completed', roomCode: null, gameId: 'g1', absenceDeadline: null, absentPlayerId: null },
          { id: 'r3m1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 1, player1Id: 'p_traf', player2Id: 'p_mak', player1Username: 'Trafalgar', player2Username: 'mak52554', winnerId: null, winnerUsername: null, isBye: false, status: 'forfeit', roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
          { id: 'r3m3', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 3, player1Id: 'p_lego', player2Id: 'p_mroz', player1Username: 'legoubz', player2Username: 'Mister_Mrozikk', winnerId: null, winnerUsername: null, isBye: false, status: 'forfeit', roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
        ],
      };

      const view = buildTournamentResultsView(t);
      expect(view.doubleForfeitCount).toBe(2);
      const doubles = view.entries.filter((e) => e.outcome === 'double_forfeit');
      expect(doubles).toHaveLength(2);
      for (const d of doubles) {
        expect(d.doubleForfeitUsernames).toHaveLength(2);
      }
      const r1Entry = view.entries.find((e) => e.matchId === 'r1m0');
      expect(r1Entry?.outcome).toBe('win_played');
      expect(r1Entry?.gameId).toBe('g1');
    });

    it('after admin recovery, results view (called on still-completed snapshot) still surfaces forfeit context', () => {
      const t: TournamentData = {
        ...makeTournament(),
        matches: [
          { id: 'r3m1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 1, player1Id: 'p_traf', player2Id: 'p_mak', player1Username: 'Trafalgar', player2Username: 'mak52554', winnerId: null, winnerUsername: null, isBye: false, status: 'forfeit', roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
        ],
      };
      const view = buildTournamentResultsView(t);
      expect(view.forfeitCount + view.doubleForfeitCount).toBeGreaterThan(0);
      expect(view.entries[0].outcome).toBe('double_forfeit');
    });
  });

  describe('regression: the 12 may bug cannot reproduce', () => {
    it('chain test: connected players + 4 simultaneous absence-timer fires = 0 forfeit', async () => {
      const io = makeIo('t1', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
      p.tournamentMatch.update.mockResolvedValue({});

      await Promise.all([
        fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', null, false),
        fireAbsenceTimerCallback(io as never, 't1', 'm2', 'p3', 'p4', null, false),
        fireAbsenceTimerCallback(io as never, 't1', 'm3', 'p5', 'p6', null, false),
      ]);

      expect(io.emissions.filter((e) => e.event === 'tournament:please-confirm-ready')).toHaveLength(3);
      expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('mixed: 2 connected, 1 disconnected match in same round → only the truly absent get forfeited', async () => {
      const io = makeIo('t1', ['p1', 'p2', 'p3', 'p4']);
      p.tournamentMatch.update.mockResolvedValue({});
      p.tournamentMatch.findUnique.mockResolvedValue({
        id: 'm3', tournamentId: 't1', status: 'ready',
        player1Id: 'p5', player2Id: 'p6',
        player1Username: 'P5', player2Username: 'P6',
        round: 3, matchIndex: 0, bracket: null, roomCode: null,
      });
      p.tournament.findUnique.mockImplementation(async (args: { include?: { participants?: unknown } }) => {
        if (args?.include?.participants) {
          return { id: 't1', currentRound: 3, totalRounds: 3, status: 'in_progress', participants: [], matches: [] };
        }
        return { format: 'swiss' };
      });
      p.tournamentParticipant.updateMany.mockResolvedValue({ count: 2 });
      p.tournamentMatch.findMany.mockResolvedValue([]);

      await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', null, false);
      await fireAbsenceTimerCallback(io as never, 't1', 'm2', 'p3', 'p4', null, false);
      await fireAbsenceTimerCallback(io as never, 't1', 'm3', 'p5', 'p6', null, false);

      expect(io.emissions.filter((e) => e.event === 'tournament:please-confirm-ready')).toHaveLength(2);

      expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['p5', 'p6'] } }),
        data: expect.objectContaining({ eliminated: true }),
      }));
    });
  });
});
