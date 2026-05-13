import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTournamentStore, type TournamentData } from '@/stores/tournamentStore';

function makeTournament(overrides: Partial<TournamentData> = {}): TournamentData {
  return {
    id: 't1',
    name: 'Test Tournament',
    type: 'simulator',
    status: 'in_progress',
    gameMode: 'classic',
    maxPlayers: 8,
    currentRound: 1,
    totalRounds: 3,
    isPublic: true,
    joinCode: null,
    creatorId: 'creator',
    creatorUsername: 'creator',
    requiresDiscord: false,
    useBanList: false,
    sealedBoosterCount: null,
    sealedSetChoice: null,
    discordRoleReward: null,
    bannedCardIds: [],
    allowedLeagues: [],
    winnerId: null,
    winnerUsername: null,
    participants: [],
    matches: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('tournamentStore handlers (Fix #2 client robustness)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tournament: makeTournament({ currentRound: 2 }) }),
    }));
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    useTournamentStore.setState({ activeTournament: null, loading: false, error: null, errorKey: null });
  });

  afterEach(() => {
    useTournamentStore.setState({ activeTournament: null, loading: false, error: null, errorKey: null });
  });

  describe('handleRoundComplete', () => {
    it('triggers fetchTournament when activeTournament exists (so matches refresh)', async () => {
      useTournamentStore.setState({
        activeTournament: makeTournament({ id: 't1', currentRound: 1 }),
      });

      useTournamentStore.getState().handleRoundComplete({ completedRound: 1, nextRound: 2 });

      expect(useTournamentStore.getState().activeTournament?.currentRound).toBe(2);
      expect(fetchSpy).toHaveBeenCalledWith('/api/tournaments/t1');
    });

    it('is a no-op when no activeTournament', () => {
      useTournamentStore.setState({ activeTournament: null });
      useTournamentStore.getState().handleRoundComplete({ completedRound: 1, nextRound: 2 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('updates currentRound synchronously before fetch resolves', () => {
      useTournamentStore.setState({
        activeTournament: makeTournament({ id: 't1', currentRound: 2 }),
      });
      useTournamentStore.getState().handleRoundComplete({ completedRound: 2, nextRound: 3 });
      expect(useTournamentStore.getState().activeTournament?.currentRound).toBe(3);
    });
  });

  describe('handleMatchUpdate', () => {
    it('updates only the targeted match by id', () => {
      useTournamentStore.setState({
        activeTournament: makeTournament({
          matches: [
            { id: 'm1', tournamentId: 't1', bracket: 'main', round: 1, matchIndex: 0, player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2', winnerId: null, winnerUsername: null, isBye: false, status: 'ready', roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
            { id: 'm2', tournamentId: 't1', bracket: 'main', round: 1, matchIndex: 1, player1Id: 'p3', player2Id: 'p4', player1Username: 'P3', player2Username: 'P4', winnerId: null, winnerUsername: null, isBye: false, status: 'ready', roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
          ],
        }),
      });

      useTournamentStore.getState().handleMatchUpdate({ matchId: 'm1', status: 'in_progress', roomCode: 'ROOM1' });

      const matches = useTournamentStore.getState().activeTournament?.matches;
      expect(matches?.[0].status).toBe('in_progress');
      expect(matches?.[0].roomCode).toBe('ROOM1');
      expect(matches?.[1].status).toBe('ready');
      expect(matches?.[1].roomCode).toBeNull();
    });

    it('is a no-op when no activeTournament', () => {
      useTournamentStore.setState({ activeTournament: null });
      useTournamentStore.getState().handleMatchUpdate({ matchId: 'm1', status: 'completed' });
      expect(useTournamentStore.getState().activeTournament).toBeNull();
    });
  });

  describe('handleTournamentComplete', () => {
    it('flips status to completed and records winner', () => {
      useTournamentStore.setState({
        activeTournament: makeTournament({ status: 'in_progress' }),
      });

      useTournamentStore.getState().handleTournamentComplete({ winnerId: 'p1', winnerUsername: 'P1' });

      const t = useTournamentStore.getState().activeTournament;
      expect(t?.status).toBe('completed');
      expect(t?.winnerId).toBe('p1');
      expect(t?.winnerUsername).toBe('P1');
    });
  });

  describe('handleSwissRoundGenerated', () => {
    it('updates currentRound + triggers fetchTournament', () => {
      useTournamentStore.setState({
        activeTournament: makeTournament({ id: 't1', currentRound: 1 }),
      });

      useTournamentStore.getState().handleSwissRoundGenerated({ round: 2 });

      expect(useTournamentStore.getState().activeTournament?.currentRound).toBe(2);
      expect(fetchSpy).toHaveBeenCalledWith('/api/tournaments/t1');
    });
  });
});
