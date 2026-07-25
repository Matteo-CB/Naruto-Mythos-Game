import { describe, it, expect } from 'vitest';
import { buildMatchContextReset, shouldEnterMatchRoom, useSocketStore } from '@/lib/socket/client';

describe('per-match client state reset', () => {
  it('clears every field that let a previous round leak into the next one', () => {
    const reset = buildMatchContextReset() as Record<string, unknown>;
    const mustBeCleared = [
      'roomCode',
      'playerRole',
      'visibleState',
      'playerNames',
      'gameStarted',
      'gameEnded',
      'gameResult',
      'opponentJoined',
      'tournamentMatchRoom',
      'currentTournamentId',
      'chessClock',
      'pendingReconnect',
    ];
    for (const key of mustBeCleared) {
      expect(reset).toHaveProperty(key);
      const value = reset[key];
      expect(value === null || value === false).toBe(true);
    }
  });

  it('resets the join state so the next room:join is not swallowed', () => {
    expect((buildMatchContextReset() as Record<string, unknown>).joinState).toBe('idle');
  });

  it('drops the previous match chat so it cannot appear in the new match', () => {
    const reset = buildMatchContextReset() as Record<string, unknown>;
    expect(reset.chatMessages).toEqual([]);
    expect(reset.unreadChatCount).toBe(0);
  });

  it('clears sealed and rematch leftovers', () => {
    const reset = buildMatchContextReset() as Record<string, unknown>;
    expect(reset.isSealedRoom).toBe(false);
    expect(reset.sealedBoosters).toBeNull();
    expect(reset.sealedDeckSubmitted).toBe(false);
    expect(reset.rematchState).toBe('none');
    expect(reset.rematchRoomCode).toBeNull();
  });
});

describe('joinRoom cannot carry a previous match into the new room', () => {
  function seedPreviousMatch(roomCode: string) {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const fakeSocket = {
      emit: (event: string, payload: unknown) => { emitted.push({ event, payload }); },
      on: () => {},
      off: () => {},
    };
    useSocketStore.setState({
      socket: fakeSocket as never,
      connected: true,
      roomCode,
      playerRole: 'player2',
      gameStarted: true,
      gameEnded: true,
      visibleState: { phase: 'action' } as never,
      playerNames: { player1: 'Opponent', player2: 'Me' },
      tournamentMatchRoom: true,
      currentTournamentId: 'tour-1',
    });
    return emitted;
  }

  it('wipes the previous round state so playerRole can never be paired with the old playerNames', () => {
    const emitted = seedPreviousMatch('T-round2');
    useSocketStore.getState().joinRoom('T-round3', 'user-1');
    const st = useSocketStore.getState();
    expect(st.visibleState).toBeNull();
    expect(st.playerNames).toBeNull();
    expect(st.playerRole).toBeNull();
    expect(st.gameStarted).toBe(false);
    expect(st.gameEnded).toBe(false);
    expect(st.roomCode).toBe('T-round3');
    expect(st.joinState).toBe('joining');
    expect(emitted.some((e) => e.event === 'room:join')).toBe(true);
  });

  it('a retry on the same room code keeps the state it already has', () => {
    seedPreviousMatch('T-round3');
    useSocketStore.getState().joinRoom('T-round3', 'user-1');
    const st = useSocketStore.getState();
    expect(st.playerNames).toEqual({ player1: 'Opponent', player2: 'Me' });
    expect(st.roomCode).toBe('T-round3');
  });
});

describe('match entry decision', () => {
  it('a stale room code from a previous round never blocks entering the new room', () => {
    expect(shouldEnterMatchRoom('T-round1', false, 'T-round2')).toBe(true);
  });

  it('an already running game in the same room is not re-entered', () => {
    expect(shouldEnterMatchRoom('T-round2', true, 'T-round2')).toBe(false);
  });

  it('an empty target room code is never entered', () => {
    expect(shouldEnterMatchRoom(null, false, '')).toBe(false);
  });
});
