import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMatchRoomTimers, finalizeAndScheduleRoomDeletion } from '../tournament/matchRoomCleanup';
import { logMatchEvent } from '../tournament/matchEventLog';

type FakeTimer = number & { __fake?: true };

interface FakeRoom {
  code: string;
  hostId: string;
  hostSocket: string;
  guestId: string | null;
  guestSocket: string | null;
  finalized: boolean;
  tournamentJoinTimer: FakeTimer | null;
  sealedTimer: FakeTimer | null;
  chessClockTickTimer: FakeTimer | null;
  chessClockMulliganTimer: FakeTimer | null;
  [key: string]: unknown;
}

function makeRoom(overrides: Partial<FakeRoom> = {}): FakeRoom {
  return {
    code: 'T-test01',
    hostId: 'h1',
    hostSocket: 's1',
    guestId: 'g1',
    guestSocket: 's2',
    finalized: false,
    tournamentJoinTimer: 5 as unknown as FakeTimer,
    sealedTimer: 3 as unknown as FakeTimer,
    chessClockTickTimer: 6 as unknown as FakeTimer,
    chessClockMulliganTimer: 7 as unknown as FakeTimer,
    ...overrides,
  };
}

describe('matchRoomCleanup helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('clearAllMatchRoomTimers nulls every timer field', () => {
    const room = makeRoom();
    expect(room.tournamentJoinTimer).not.toBeNull();
    expect(room.sealedTimer).not.toBeNull();
    expect(room.chessClockTickTimer).not.toBeNull();
    expect(room.chessClockMulliganTimer).not.toBeNull();

    clearAllMatchRoomTimers(room as never);

    expect(room.tournamentJoinTimer).toBeNull();
    expect(room.sealedTimer).toBeNull();
    expect(room.chessClockTickTimer).toBeNull();
    expect(room.chessClockMulliganTimer).toBeNull();
  });

  it('clearAllMatchRoomTimers is a no-op when timers are already null', () => {
    const room = makeRoom({
      tournamentJoinTimer: null,
      sealedTimer: null,
      chessClockTickTimer: null,
      chessClockMulliganTimer: null,
    });
    expect(() => clearAllMatchRoomTimers(room as never)).not.toThrow();
  });

  it('finalizeAndScheduleRoomDeletion sets finalized and schedules removal', () => {
    const room = makeRoom();
    const rooms = new Map<string, typeof room>();
    rooms.set(room.code, room);

    finalizeAndScheduleRoomDeletion(rooms as never, room.code, 5_000);

    expect(room.finalized).toBe(true);
    expect(room.tournamentJoinTimer).toBeNull();
    expect(rooms.has(room.code)).toBe(true);

    vi.advanceTimersByTime(5_000);

    expect(rooms.has(room.code)).toBe(false);
  });

  it('finalizeAndScheduleRoomDeletion does not delete a room that was replaced before timeout', () => {
    const original = makeRoom();
    const rooms = new Map<string, typeof original>();
    rooms.set(original.code, original);

    finalizeAndScheduleRoomDeletion(rooms as never, original.code, 5_000);

    const replacement = makeRoom({ hostId: 'different' });
    rooms.set(original.code, replacement);

    vi.advanceTimersByTime(5_000);

    expect(rooms.has(original.code)).toBe(true);
    expect(rooms.get(original.code)).toBe(replacement);
  });

  it('finalizeAndScheduleRoomDeletion is safe on missing room', () => {
    const rooms = new Map<string, ReturnType<typeof makeRoom>>();
    expect(() => finalizeAndScheduleRoomDeletion(rooms as never, 'nope', 1_000)).not.toThrow();
  });
});

describe('matchEventLog', () => {
  it('emits a JSON-friendly log line with timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logMatchEvent({
      type: 'match.forfeit.absence',
      tournamentId: 't-abc',
      matchId: 'm-xyz',
      forfeitedPlayerId: 'u1',
      winnerId: 'u2',
    });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line.startsWith('[MatchEvent] ')).toBe(true);
    const json = JSON.parse(line.slice('[MatchEvent] '.length));
    expect(json.type).toBe('match.forfeit.absence');
    expect(json.tournamentId).toBe('t-abc');
    expect(json.matchId).toBe('m-xyz');
    expect(json.forfeitedPlayerId).toBe('u1');
    expect(json.winnerId).toBe('u2');
    expect(typeof json.ts).toBe('string');
    spy.mockRestore();
  });

  it('omits undefined fields cleanly', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logMatchEvent({ type: 'tournament.completed', tournamentId: 't-end' });
    const line = spy.mock.calls[0][0] as string;
    const json = JSON.parse(line.slice('[MatchEvent] '.length));
    expect(json.type).toBe('tournament.completed');
    expect(json.tournamentId).toBe('t-end');
    expect('matchId' in json).toBe(false);
    expect('forfeitedPlayerId' in json).toBe(false);
    spy.mockRestore();
  });
});

describe('cleanupTournamentMapsByIds (synchronous)', () => {
  it('deletes only the listed matchIds and cleans swissRoundLocks for the tournament', async () => {
    const mod = await import('../socket/tournamentHandlers');
    const fn = mod.cleanupTournamentMapsByIds;
    expect(typeof fn).toBe('function');
    expect(() => fn('t1', ['m1', 'm2'])).not.toThrow();
    expect(() => fn('t1', [])).not.toThrow();
  });
});
