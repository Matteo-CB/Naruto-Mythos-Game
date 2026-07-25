import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import { GameEngine } from '@/lib/engine/GameEngine';
import {
  actionMadeProgress,
  announceMissedGameEnd,
  clearStaleForcedResolver,
  FINALIZE_ANNOUNCE_GRACE_MS,
  dropImpossibleChoices,
  findImpossibleChoices,
  noteSeatInput,
  noteSeatPresence,
  phaseAdvanceStalled,
  repairStuckState,
  rooms,
  stateProgressSignature,
  whoseInputIsAwaited,
  chessClockWatchdog,
  PHASE_STALL_GRACE_MS,
  type RoomData,
} from '@/lib/socket/server';
import { createChessClock, arm } from '@/lib/timing/chessClock';
import type { GameAction, GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';

function makePlayerState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player1',
    isAI: false,
    deck: [],
    hand: [],
    discardPile: [],
    missionCards: [],
    chakra: 0,
    missionPoints: 0,
    hasPassed: false,
    charactersInPlay: 0,
    unusedMission: null,
    hasMulliganed: true,
    ...overrides,
  } as never;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: makePlayerState({ id: 'player1' }),
    player2: makePlayerState({ id: 'player2' }),
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    actionHistory: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  } as unknown as GameState;
}

function makePendingAction(player: PlayerID, overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'pa-1',
    type: 'SELECT_TARGET',
    player,
    description: 'choose',
    options: ['opt-1'],
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: 'pe-1',
    ...overrides,
  };
}

function makePendingEffect(overrides: Partial<PendingEffect> = {}): PendingEffect {
  return {
    id: 'pe-1',
    sourceCardId: 'KS-001-C',
    sourceInstanceId: 'inst-1',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: '',
    targetSelectionType: 'character',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'GUARD1',
    hostId: 'p1-id',
    hostSocket: 'sock-1',
    guestId: 'p2-id',
    guestSocket: 'sock-2',
    gameState: makeState(),
    finalized: false,
    createdAt: Date.now(),
    spectators: new Map(),
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    ...overrides,
  } as RoomData;
}

function makeIO() {
  const emitSpy = vi.fn();
  return {
    to: vi.fn(() => ({ emit: emitSpy })),
    sockets: { sockets: new Map() },
    _emit: emitSpy,
  } as never;
}

describe('stateProgressSignature: a refused action must not look like progress', () => {
  it('treats an identical state as no progress', () => {
    expect(actionMadeProgress(makeState(), makeState())).toBe(false);
  });

  it('ignores an action history entry added by a refused action', () => {
    const before = makeState();
    const after = makeState({ actionHistory: [{ player: 'player1', action: { type: 'PASS' } }] as never });
    expect(actionMadeProgress(before, after)).toBe(false);
  });

  it('sees a new log line', () => {
    expect(actionMadeProgress(makeState(), makeState({ log: [{}] as never }))).toBe(true);
  });

  it('sees a pending action appearing or disappearing', () => {
    const withPending = makeState({ pendingActions: [makePendingAction('player1')] });
    expect(actionMadeProgress(makeState(), withPending)).toBe(true);
    expect(actionMadeProgress(withPending, makeState())).toBe(true);
  });

  it('sees a pending effect being resolved in place', () => {
    const before = makeState({ pendingEffects: [makePendingEffect()] });
    const after = makeState({ pendingEffects: [makePendingEffect({ resolved: true })] });
    expect(actionMadeProgress(before, after)).toBe(true);
  });

  it('sees a board change with no log line', () => {
    const before = makeState({
      activeMissions: [{ player1Characters: [], player2Characters: [], wonBy: null }] as never,
    });
    const after = makeState({
      activeMissions: [{ player1Characters: [{}], player2Characters: [], wonBy: null }] as never,
    });
    expect(actionMadeProgress(before, after)).toBe(true);
  });

  it('sees a phase, turn or forced resolver change', () => {
    expect(actionMadeProgress(makeState(), makeState({ phase: 'mission' }))).toBe(true);
    expect(actionMadeProgress(makeState(), makeState({ turn: 2 as never }))).toBe(true);
    expect(actionMadeProgress(makeState(), makeState({ pendingForcedResolver: 'player2' }))).toBe(true);
  });

  it('is stable for a null state', () => {
    expect(stateProgressSignature(null)).toBe('none');
    expect(actionMadeProgress(null, null)).toBe(false);
  });
});

describe('seat presence versus seat input', () => {
  it('presence proves the player is alive without refreshing the anti-AFK window', () => {
    const room = makeRoom({ player1DisconnectedAt: Date.now() - 5_000 });
    room.chessClock = arm(createChessClock(), 'player1', 1_000);
    const idleBefore = room.chessClock.idleStartedAt;
    noteSeatPresence(room, 'player1', 50_000);
    expect(room.player1DisconnectedAt).toBeNull();
    expect(room.lastSeatInputAt?.player1).toBe(50_000);
    expect(room.chessClock.idleStartedAt).toBe(idleBefore);
  });

  it('a real input does refresh the anti-AFK window', () => {
    const room = makeRoom();
    room.chessClock = arm(createChessClock(), 'player1', 1_000);
    noteSeatInput(room, 'player1', 50_000);
    expect(room.chessClock.idleStartedAt).toBe(50_000);
  });
});

describe('clearStaleForcedResolver', () => {
  it('clears a resolver that owes no input', () => {
    const state = makeState({ pendingForcedResolver: 'player2' });
    expect(clearStaleForcedResolver(state)).toBe(true);
    expect(state.pendingForcedResolver).toBeUndefined();
  });

  it('keeps a resolver that still owes an input', () => {
    const state = makeState({
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player2')],
    });
    expect(clearStaleForcedResolver(state)).toBe(false);
    expect(state.pendingForcedResolver).toBe('player2');
  });

  it('is a no-op when there is no resolver at all', () => {
    expect(clearStaleForcedResolver(makeState())).toBe(false);
    expect(clearStaleForcedResolver(null)).toBe(false);
  });
});

describe('impossible required choices', () => {
  it('flags a required choice with no selectable option', () => {
    const state = makeState({
      pendingActions: [makePendingAction('player1', { options: [] })],
      pendingEffects: [makePendingEffect()],
    });
    expect(findImpossibleChoices(state)).toEqual(['pa-1']);
    expect(dropImpossibleChoices(state)).toBe(true);
    expect(state.pendingActions).toEqual([]);
    expect(state.pendingEffects).toEqual([]);
  });

  it('leaves an optional zero-selection choice alone', () => {
    const state = makeState({
      pendingActions: [makePendingAction('player1', { options: [], minSelections: 0 })],
    });
    expect(findImpossibleChoices(state)).toEqual([]);
    expect(dropImpossibleChoices(state)).toBe(false);
  });

  it('leaves an answerable choice alone', () => {
    const state = makeState({ pendingActions: [makePendingAction('player1')] });
    expect(dropImpossibleChoices(state)).toBe(false);
    expect(state.pendingActions.length).toBe(1);
  });

  it('is repaired by repairStuckState so nobody is defeated for a choice they cannot make', () => {
    const room = makeRoom({
      gameState: makeState({
        pendingActions: [makePendingAction('player1', { options: [] })],
        pendingEffects: [makePendingEffect()],
      }),
    });
    expect(repairStuckState(room)).toBe(true);
    expect(room.gameState!.pendingActions).toEqual([]);
  });
});

describe('phaseAdvanceStalled', () => {
  it('is true for an end phase left with only resolved effects and no awaited input', () => {
    const state = makeState({ phase: 'end', pendingEffects: [makePendingEffect({ resolved: true })] });
    expect(whoseInputIsAwaited(state)).toBe(null);
    expect(phaseAdvanceStalled(state)).toBe(true);
  });

  it('is true for a mission phase with no scoring progress and nothing pending', () => {
    expect(phaseAdvanceStalled(makeState({ phase: 'mission' }))).toBe(true);
  });

  it('is false while an input is still awaited', () => {
    const withOrphan = makeState({ phase: 'end', pendingEffects: [makePendingEffect()] });
    expect(phaseAdvanceStalled(withOrphan)).toBe(false);

    const withProgress = makeState({
      phase: 'mission',
      missionScoringProgress: { winner: 'player1', currentRankIndex: 0, missionCardScoreDone: false, processedCharacterIds: [] } as never,
    });
    expect(phaseAdvanceStalled(withProgress)).toBe(false);
  });

  it('is false outside the mission and end phases', () => {
    expect(phaseAdvanceStalled(makeState({ phase: 'action' }))).toBe(false);
    expect(phaseAdvanceStalled(null)).toBe(false);
  });
});

describe('announceMissedGameEnd: a decided game is never left silently finalized', () => {
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    winnerSpy?.mockRestore();
  });

  it('stamps the room on first sight and waits out the grace window', () => {
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue('player1');
    const io = makeIO();
    const room = makeRoom({ finalized: true, gameState: makeState({ phase: 'gameOver' }) });
    const now = Date.now();
    expect(announceMissedGameEnd(room, room.code, io, now)).toBe(false);
    expect(room.finalizedAt).toBe(now);
    expect(announceMissedGameEnd(room, room.code, io, now + 1_000)).toBe(false);
  });

  it('sends the fallback result once the grace window has passed', () => {
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue('player2');
    const io = makeIO();
    const now = Date.now();
    const room = makeRoom({
      finalized: true,
      finalizedAt: now - (FINALIZE_ANNOUNCE_GRACE_MS + 1_000),
      gameState: makeState({ phase: 'gameOver' }),
    });
    expect(announceMissedGameEnd(room, room.code, io, now)).toBe(true);
    expect(room.finalBroadcast?.event).toBe('game:ended');
    expect((io as unknown as { _emit: ReturnType<typeof vi.fn> })._emit).toHaveBeenCalledWith(
      'game:ended',
      expect.objectContaining({ winner: 'player2' }),
    );
  });

  it('never fires twice for the same room', () => {
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue('player1');
    const io = makeIO();
    const now = Date.now();
    const room = makeRoom({
      finalized: true,
      finalizedAt: now - (FINALIZE_ANNOUNCE_GRACE_MS + 1_000),
      gameState: makeState({ phase: 'gameOver' }),
      finalBroadcast: { event: 'game:ended', player1: {}, player2: {} },
    });
    expect(announceMissedGameEnd(room, room.code, io, now)).toBe(false);
  });

  it('never invents a result for an undecided game', () => {
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue(null);
    const io = makeIO();
    const now = Date.now();
    const room = makeRoom({
      finalized: true,
      finalizedAt: now - (FINALIZE_ANNOUNCE_GRACE_MS + 1_000),
      gameState: makeState(),
    });
    expect(announceMissedGameEnd(room, room.code, io, now)).toBe(false);
    expect(room.finalBroadcast).toBeUndefined();
  });
});

describe('the watchdog force-advances a stalled phase', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const code of Array.from(rooms.keys())) rooms.delete(code);
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: GameState) => state);
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue(null);
  });

  afterEach(() => {
    applySpy.mockRestore();
    winnerSpy.mockRestore();
    for (const code of Array.from(rooms.keys())) {
      const room = rooms.get(code);
      if (room?.chessClockTickTimer) clearInterval(room.chessClockTickTimer);
      rooms.delete(code);
    }
  });

  it('advances an end phase that nobody can resolve', () => {
    const room = makeRoom({
      code: 'STALL-END',
      gameState: makeState({ phase: 'end', pendingEffects: [makePendingEffect({ resolved: true })] }),
      lastApplyActionAt: Date.now() - (PHASE_STALL_GRACE_MS + 1_000),
    });
    rooms.set(room.code, room);

    chessClockWatchdog(makeIO());

    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('ADVANCE_PHASE');
  });

  it('waits out the grace window so it never races a legitimate resolution', () => {
    const room = makeRoom({
      code: 'STALL-FRESH',
      gameState: makeState({ phase: 'end', pendingEffects: [makePendingEffect({ resolved: true })] }),
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);

    chessClockWatchdog(makeIO());

    expect(applySpy).not.toHaveBeenCalled();
  });
});
