import { describe, it, expect } from 'vitest';
import {
  resolveSeatBySocket,
  resolveSeatByUserId,
  canStartTournamentGame,
  shouldForfeitForDisconnect,
  shouldClearDisconnectStamp,
  seatActedSince,
  type SeatSocketsView,
} from '@/lib/socket/roomSeats';
import {
  selectCurrentMatchForUser,
  isOpenForUser,
  type SelectableMatch,
} from '@/lib/tournament/matchSelection';
import { shouldEnterMatchRoom } from '@/lib/socket/client';
import { rooms, isUserInAnotherLiveGame } from '@/lib/socket/server';

function tournamentRoom(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: 't1',
    hostDeck: { characters: [], missions: [] },
    guestDeck: { characters: [], missions: [] },
    hostSocket: '',
    guestSocket: null as string | null,
    gameState: null,
    finalized: false,
    ...overrides,
  };
}

describe('room seat resolution', () => {
  it('never seats a socket that is neither the host nor the guest socket', () => {
    const room: SeatSocketsView = { hostSocket: 'sock-host', guestSocket: 'sock-guest' };
    expect(resolveSeatBySocket(room, 'sock-host')).toBe('player1');
    expect(resolveSeatBySocket(room, 'sock-guest')).toBe('player2');
    expect(resolveSeatBySocket(room, 'sock-stale')).toBeNull();
  });

  it('treats an empty seat socket as unoccupied instead of matching an empty id', () => {
    const room: SeatSocketsView = { hostSocket: '', guestSocket: null };
    expect(resolveSeatBySocket(room, '')).toBeNull();
    expect(resolveSeatBySocket(room, 'anything')).toBeNull();
  });

  it('resolves a seat from the user id for both sides', () => {
    const room = { hostId: 'u1', guestId: 'u2' };
    expect(resolveSeatByUserId(room, 'u1')).toBe('player1');
    expect(resolveSeatByUserId(room, 'u2')).toBe('player2');
    expect(resolveSeatByUserId(room, 'u3')).toBeNull();
  });
});

describe('tournament game auto-start guard', () => {
  it('does not start until BOTH seat sockets are bound, whatever the join order', () => {
    const room = tournamentRoom();
    expect(canStartTournamentGame(room)).toBe(false);

    room.guestSocket = 'sock-guest';
    expect(canStartTournamentGame(room)).toBe(false);

    room.hostSocket = 'sock-host';
    expect(canStartTournamentGame(room)).toBe(true);
  });

  it('is symmetric: host first then guest starts exactly like guest first then host', () => {
    const guestFirst = tournamentRoom({ guestSocket: 'g' });
    guestFirst.hostSocket = 'h';
    const hostFirst = tournamentRoom({ hostSocket: 'h' });
    hostFirst.guestSocket = 'g';
    expect(canStartTournamentGame(guestFirst)).toBe(true);
    expect(canStartTournamentGame(hostFirst)).toBe(true);
  });

  it('is idempotent: a room that already has a game never starts a second one', () => {
    const room = tournamentRoom({ hostSocket: 'h', guestSocket: 'g', gameState: { phase: 'mulligan' } });
    expect(canStartTournamentGame(room)).toBe(false);
  });

  it('refuses concurrent starts while one is in flight', () => {
    const room = tournamentRoom({ hostSocket: 'h', guestSocket: 'g', tournamentGameStarting: true });
    expect(canStartTournamentGame(room)).toBe(false);
  });

  it('refuses to start when a deck was lost and not re-hydrated', () => {
    const room = tournamentRoom({ hostSocket: 'h', guestSocket: 'g', guestDeck: null });
    expect(canStartTournamentGame(room)).toBe(false);
  });

  it('never starts a non-tournament room', () => {
    const room = tournamentRoom({ tournamentId: null, hostSocket: 'h', guestSocket: 'g' });
    expect(canStartTournamentGame(room)).toBe(false);
  });
});

describe('disconnect forfeit eligibility', () => {
  const FORFEIT_MS = 120_000;
  const stamp = 1_000_000;
  const now = stamp + FORFEIT_MS + 1;

  it('forfeits only when the stamp is old AND the seat is truly unreachable', () => {
    const room = { hostSocket: '', player1DisconnectedAt: stamp, lastSeatInputAt: { player1: 0, player2: 0 } };
    expect(
      shouldForfeitForDisconnect(room, 'player1', now, FORFEIT_MS, { seatSocketAlive: false, userHasLiveSocket: false }),
    ).toBe(true);
  });

  it('never forfeits a seat whose socket is alive again', () => {
    const room = { hostSocket: 'new-sock', player1DisconnectedAt: stamp, lastSeatInputAt: { player1: 0, player2: 0 } };
    expect(
      shouldForfeitForDisconnect(room, 'player1', now, FORFEIT_MS, { seatSocketAlive: true, userHasLiveSocket: true }),
    ).toBe(false);
  });

  it('never forfeits a player who has acted since the disconnect stamp', () => {
    const room = { hostSocket: '', player1DisconnectedAt: stamp, lastSeatInputAt: { player1: stamp + 500, player2: 0 } };
    expect(
      shouldForfeitForDisconnect(room, 'player1', now, FORFEIT_MS, { seatSocketAlive: false, userHasLiveSocket: false }),
    ).toBe(false);
  });

  it('never forfeits a player who is online on another socket', () => {
    const room = { guestSocket: null, player2DisconnectedAt: stamp, lastSeatInputAt: { player1: 0, player2: 0 } };
    expect(
      shouldForfeitForDisconnect(room, 'player2', now, FORFEIT_MS, { seatSocketAlive: false, userHasLiveSocket: true }),
    ).toBe(false);
  });

  it('does not forfeit before the countdown elapsed', () => {
    const room = { hostSocket: '', player1DisconnectedAt: stamp, lastSeatInputAt: { player1: 0, player2: 0 } };
    expect(
      shouldForfeitForDisconnect(room, 'player1', stamp + 10, FORFEIT_MS, { seatSocketAlive: false, userHasLiveSocket: false }),
    ).toBe(false);
  });

  it('clears the stamp of a player who came back through room:join', () => {
    const room = { guestSocket: 'sock-back', player2DisconnectedAt: stamp };
    expect(shouldClearDisconnectStamp(room, 'player2', { seatSocketAlive: true, userHasLiveSocket: true })).toBe(true);
    expect(shouldClearDisconnectStamp(room, 'player1', { seatSocketAlive: true, userHasLiveSocket: true })).toBe(false);
  });

  it('detects a seat that acted after a given instant', () => {
    const room = { lastSeatInputAt: { player1: 50, player2: 200 } };
    expect(seatActedSince(room, 'player1', 100)).toBe(false);
    expect(seatActedSince(room, 'player2', 100)).toBe(true);
    expect(seatActedSince({}, 'player1', 0)).toBe(false);
  });
});

describe('current match selection for a player', () => {
  const base: SelectableMatch = {
    id: 'm', round: 1, matchIndex: 0, status: 'ready', player1Id: 'me', player2Id: 'other',
  };

  it('ignores byes and closed matches', () => {
    expect(isOpenForUser({ ...base, isBye: true }, 'me')).toBe(false);
    expect(isOpenForUser({ ...base, status: 'completed' }, 'me')).toBe(false);
    expect(isOpenForUser({ ...base, status: 'forfeit' }, 'me')).toBe(false);
    expect(isOpenForUser(base, 'someone-else')).toBe(false);
    expect(isOpenForUser(base, 'me')).toBe(true);
  });

  it('prefers the live match with a room over a stale earlier round', () => {
    const matches: SelectableMatch[] = [
      { id: 'zombie-r2', round: 2, matchIndex: 0, status: 'in_progress', roomCode: 'T-old', player1Id: 'me', player2Id: 'a' },
      { id: 'fresh-r3', round: 3, matchIndex: 0, status: 'in_progress', roomCode: 'T-new', player1Id: 'me', player2Id: 'b' },
    ];
    expect(selectCurrentMatchForUser(matches, 'me', 3)?.id).toBe('fresh-r3');
  });

  it('prefers the current round over an older open round', () => {
    const matches: SelectableMatch[] = [
      { id: 'old', round: 2, matchIndex: 0, status: 'in_progress', roomCode: null, player1Id: 'me', player2Id: 'a' },
      { id: 'current', round: 3, matchIndex: 1, status: 'ready', roomCode: null, player1Id: 'me', player2Id: 'b' },
    ];
    expect(selectCurrentMatchForUser(matches, 'me', 3)?.id).toBe('current');
  });

  it('falls back to the highest open round when currentRound is unknown', () => {
    const matches: SelectableMatch[] = [
      { id: 'r1', round: 1, matchIndex: 0, status: 'pending', player1Id: 'me', player2Id: 'a' },
      { id: 'r4', round: 4, matchIndex: 0, status: 'pending', player1Id: 'me', player2Id: 'b' },
    ];
    expect(selectCurrentMatchForUser(matches, 'me', null)?.id).toBe('r4');
  });

  it('returns undefined when the player has no open match', () => {
    expect(selectCurrentMatchForUser([], 'me', 1)).toBeUndefined();
    expect(selectCurrentMatchForUser([base], undefined, 1)).toBeUndefined();
  });
});

describe('never pull a player out of a game they are already playing', () => {
  function liveRoom(overrides: Record<string, unknown>) {
    return {
      hostId: 'h',
      guestId: 'g',
      finalized: false,
      gameState: { phase: 'action' },
      tournamentMatchId: null,
      ...overrides,
    } as never;
  }

  it('reports a live casual game as a blocking game for a tournament invite', () => {
    rooms.set('CASUAL1', liveRoom({ hostId: 'kutxyt', guestId: 'someone' }));
    try {
      expect(isUserInAnotherLiveGame('kutxyt', 'match-2')).toBe(true);
      expect(isUserInAnotherLiveGame('nobody', 'match-2')).toBe(false);
    } finally {
      rooms.delete('CASUAL1');
    }
  });

  it('does not treat the tournament match room itself as another game', () => {
    rooms.set('T-abc', liveRoom({ hostId: 'kutxyt', tournamentMatchId: 'match-2' }));
    try {
      expect(isUserInAnotherLiveGame('kutxyt', 'match-2')).toBe(false);
    } finally {
      rooms.delete('T-abc');
    }
  });

  it('ignores finished and finalized rooms', () => {
    rooms.set('OVER1', liveRoom({ hostId: 'kutxyt', gameState: { phase: 'gameOver' } }));
    rooms.set('OVER2', liveRoom({ hostId: 'kutxyt', finalized: true }));
    rooms.set('PREGAME', liveRoom({ hostId: 'kutxyt', gameState: null }));
    try {
      expect(isUserInAnotherLiveGame('kutxyt', 'match-2')).toBe(false);
    } finally {
      rooms.delete('OVER1');
      rooms.delete('OVER2');
      rooms.delete('PREGAME');
    }
  });
});

describe('client match entry guard', () => {
  it('enters a new room even when a stale room code is still held', () => {
    expect(shouldEnterMatchRoom('T-old', false, 'T-new')).toBe(true);
    expect(shouldEnterMatchRoom('T-old', true, 'T-new')).toBe(true);
    expect(shouldEnterMatchRoom(null, false, 'T-new')).toBe(true);
  });

  it('does not re-enter the room whose game is already running', () => {
    expect(shouldEnterMatchRoom('T-new', true, 'T-new')).toBe(false);
  });

  it('re-enters its own room when the game has not started yet', () => {
    expect(shouldEnterMatchRoom('T-new', false, 'T-new')).toBe(true);
  });
});
