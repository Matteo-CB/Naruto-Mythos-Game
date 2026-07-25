import { describe, it, expect } from 'vitest';
import { whoseInputIsAwaited, computeAwaitedInputKey, syncChessClock } from '@/lib/socket/server';
import { createChessClock, CHESS_CLOCK_INITIAL_MS } from '@/lib/timing/chessClock';
import type { GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';
import type { RoomData } from '@/lib/socket/server';


function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {} as never,
    player2: {} as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  };
}

function makePendingAction(player: PlayerID, overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'pa-1',
    type: 'SELECT_TARGET',
    player,
    description: 'Test pending action',
    ...overrides,
  } as PendingAction;
}

function makePendingEffect(selectingPlayer: PlayerID | undefined, overrides: Partial<PendingEffect> = {}): PendingEffect {
  return {
    id: 'pe-1',
    sourceCardId: 'KS-001-C',
    sourceInstanceId: 'inst-1',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: 'Test',
    targetSelectionType: 'character',
    sourcePlayer: 'player1',
    requiresTargetSelection: false,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
    selectingPlayer,
    ...overrides,
  };
}

describe('whoseInputIsAwaited', () => {
  it('returns null for null state', () => {
    expect(whoseInputIsAwaited(null)).toBe(null);
  });

  it('returns null when game has a forfeitedBy', () => {
    expect(whoseInputIsAwaited(makeState({ forfeitedBy: 'player1' }))).toBe(null);
  });

  it('returns null for gameOver phase', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'gameOver' }))).toBe(null);
  });

  it('returns null for setup phase', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'setup' }))).toBe(null);
  });

  it('returns null for mulligan phase (handled by separate mulligan timer)', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'mulligan' }))).toBe(null);
  });

  it('returns null for start phase with no pending input', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'start' }))).toBe(null);
  });

  it('returns null for end phase with no pending input', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'end' }))).toBe(null);
  });

  it('returns pending action player even in start/end phase', () => {
    const s = makeState({ phase: 'start', pendingActions: [makePendingAction('player2')] });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns pending forced resolver above all other priorities while it still owes an input', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player1'), makePendingAction('player2', { id: 'pa-2' })],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('ignores a stale forced resolver that has nothing left to answer', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: 'player2',
    });
    expect(whoseInputIsAwaited(s)).toBe('player1');
  });

  it('ignores a stale forced resolver and falls back to the real pending action owner', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player2',
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player1')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player1');
  });

  it('returns first pending action player in action phase', () => {
    const s = makeState({
      pendingActions: [makePendingAction('player2'), makePendingAction('player1')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns pending effect selectingPlayer when no pending actions', () => {
    const s = makeState({
      pendingEffects: [makePendingEffect('player2')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('skips already-resolved pending effects', () => {
    const s = makeState({
      pendingEffects: [
        makePendingEffect('player1', { resolved: true }),
        makePendingEffect('player2', { resolved: false }),
      ],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('skips pending effects without a selectingPlayer', () => {
    const s = makeState({
      pendingEffects: [
        makePendingEffect(undefined),
        makePendingEffect('player2'),
      ],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns mission scoring winner during mission phase', () => {
    const s = makeState({
      phase: 'mission',
      activePlayer: 'player1',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: 'player2',
      },
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns null during mission phase if no missionScoringProgress', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'mission' }))).toBe(null);
  });

  it('returns activePlayer during action phase by default', () => {
    expect(whoseInputIsAwaited(makeState({ phase: 'action', activePlayer: 'player2' }))).toBe('player2');
  });

  it('action phase activePlayer is overridden by pendingActions', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingActions: [makePendingAction('player2')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('action phase activePlayer is overridden by pendingEffects.selectingPlayer', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingEffects: [makePendingEffect('player2')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('forfeit beats every other state (instant game over)', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      forfeitedBy: 'player2',
      pendingActions: [makePendingAction('player1')],
      pendingForcedResolver: 'player1',
    });
    expect(whoseInputIsAwaited(s)).toBe(null);
  });

  it('returns pendingForcedResolver during start phase (not just action)', () => {
    const s = makeState({
      phase: 'start',
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player1'), makePendingAction('player2', { id: 'pa-2' })],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns pendingForcedResolver during end phase', () => {
    const s = makeState({
      phase: 'end',
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player1'), makePendingAction('player2', { id: 'pa-2' })],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });

  it('returns pendingForcedResolver during mission phase (above missionScoringProgress.winner)', () => {
    const s = makeState({
      phase: 'mission',
      pendingForcedResolver: 'player1',
      pendingEffects: [makePendingEffect(undefined, { sourcePlayer: 'player1' })],
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: 'player2',
      },
    });
    expect(whoseInputIsAwaited(s)).toBe('player1');
  });

  it('keeps the end phase awaited while an orphan pending effect blocks it, so the idle handler can unstick it', () => {
    const s = makeState({
      phase: 'end',
      activePlayer: 'player1',
      pendingEffects: [makePendingEffect(undefined, { sourcePlayer: 'player2', requiresTargetSelection: true })],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
  });
});

describe('computeAwaitedInputKey', () => {
  it('returns null for null/gameOver/forfeit', () => {
    expect(computeAwaitedInputKey(null)).toBe(null);
    expect(computeAwaitedInputKey(makeState({ phase: 'gameOver' }))).toBe(null);
    expect(computeAwaitedInputKey(makeState({ forfeitedBy: 'player1' }))).toBe(null);
  });

  it('returns different keys for different pending actions of the same player', () => {
    const s1 = makeState({ pendingActions: [makePendingAction('player1', { id: 'pa-A' })] });
    const s2 = makeState({ pendingActions: [makePendingAction('player1', { id: 'pa-B' })] });
    expect(computeAwaitedInputKey(s1)).not.toBe(computeAwaitedInputKey(s2));
  });

  it('returns the same key when the same pending action is queried twice', () => {
    const s = makeState({ pendingActions: [makePendingAction('player1', { id: 'pa-A' })] });
    expect(computeAwaitedInputKey(s)).toBe(computeAwaitedInputKey(s));
  });

  it('returns different keys for different pending effects of the same player', () => {
    const s1 = makeState({ pendingEffects: [makePendingEffect('player1', { id: 'pe-A' })] });
    const s2 = makeState({ pendingEffects: [makePendingEffect('player1', { id: 'pe-B' })] });
    expect(computeAwaitedInputKey(s1)).not.toBe(computeAwaitedInputKey(s2));
  });

  it('returns turn-namespaced key in action phase so a new turn resets idle for the same activePlayer', () => {
    const s1 = makeState({ phase: 'action', activePlayer: 'player1', turn: 1 });
    const s2 = makeState({ phase: 'action', activePlayer: 'player1', turn: 2 });
    expect(computeAwaitedInputKey(s1)).not.toBe(computeAwaitedInputKey(s2));
  });

  it('returns mission rank-namespaced key so each mission scoring step changes the key', () => {
    const s1 = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: 'player1',
      },
    });
    const s2 = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 1,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: 'player1',
      },
    });
    expect(computeAwaitedInputKey(s1)).not.toBe(computeAwaitedInputKey(s2));
  });

  it('forced resolver produces a stable key', () => {
    const s1 = makeState({ pendingForcedResolver: 'player1' });
    const s2 = makeState({ pendingForcedResolver: 'player1' });
    expect(computeAwaitedInputKey(s1)).toBe(computeAwaitedInputKey(s2));
  });

  it('mission scoring key differentiates missionCardScoreDone transitions', () => {
    const before = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: 'player1',
      },
    });
    const after = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: true,
        processedCharacterIds: [],
        winner: 'player1',
      },
    });
    expect(computeAwaitedInputKey(before)).not.toBe(computeAwaitedInputKey(after));
  });

  it('mission scoring key differentiates each processed character', () => {
    const after1 = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: true,
        processedCharacterIds: ['char-1'],
        winner: 'player1',
      },
    });
    const after2 = makeState({
      phase: 'mission',
      missionScoringProgress: {
        currentRankIndex: 0,
        missionCardScoreDone: true,
        processedCharacterIds: ['char-1', 'char-2'],
        winner: 'player1',
      },
    });
    expect(computeAwaitedInputKey(after1)).not.toBe(computeAwaitedInputKey(after2));
  });
});

function makeMockRoom(state: GameState | null): RoomData {
  return {
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    gameState: state,
  } as RoomData;
}

describe('syncChessClock orchestration', () => {
  it('arms the active player when starting from null and key is set', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }));
    syncChessClock(room, 1_000);
    expect(room.chessClock.active).toBe('player1');
    expect(room.chessClock.activeStartedAt).toBe(1_000);
    expect(room.chessClockLastInputKey).toBe('action:player1:1');
  });

  it('disarms and clears key when no input awaited (game over)', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1' }));
    syncChessClock(room, 1_000);
    expect(room.chessClock.active).toBe('player1');
    room.gameState = makeState({ phase: 'gameOver' });
    syncChessClock(room, 5_000);
    expect(room.chessClock.active).toBe(null);
    expect(room.chessClockLastInputKey).toBe(null);
  });

  it('switches active player when whoseInputIsAwaited changes', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }));
    syncChessClock(room, 1_000);
    room.gameState = makeState({ phase: 'action', activePlayer: 'player2', turn: 1 });
    syncChessClock(room, 5_000);
    expect(room.chessClock.active).toBe('player2');
    expect(room.chessClockLastInputKey).toBe('action:player2:1');
  });

  it('is no-op when active player and input key are unchanged (re-broadcast)', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }));
    syncChessClock(room, 1_000);
    const firstActiveStartedAt = room.chessClock.activeStartedAt;
    const firstIdleStartedAt = room.chessClock.idleStartedAt;
    syncChessClock(room, 5_000);
    expect(room.chessClock.activeStartedAt).toBe(firstActiveStartedAt);
    expect(room.chessClock.idleStartedAt).toBe(firstIdleStartedAt);
  });

  it('resets idle (NOT bank) when same player has a new sub-decision', () => {
    const room = makeMockRoom(makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingEffects: [makePendingEffect('player1', { id: 'pe-A' })],
    }));
    syncChessClock(room, 1_000);
    const bankBefore = room.chessClock.player1.remainingMs;
    expect(room.chessClockLastInputKey).toBe('pe:pe-A');

    room.gameState = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingEffects: [makePendingEffect('player1', { id: 'pe-B' })],
    });
    syncChessClock(room, 5_000);
    expect(room.chessClock.active).toBe('player1');
    expect(room.chessClock.idleStartedAt).toBe(5_000);
    expect(room.chessClock.player1.remainingMs).toBe(bankBefore);
    expect(room.chessClockLastInputKey).toBe('pe:pe-B');
  });

  it('deducts elapsed bank time when switching active player', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }));
    syncChessClock(room, 1_000);
    room.gameState = makeState({ phase: 'action', activePlayer: 'player2', turn: 1 });
    syncChessClock(room, 11_000);
    expect(room.chessClock.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 10_000);
    expect(room.chessClock.active).toBe('player2');
  });

  it('treats null/undefined/empty-string from whoseInputIsAwaited as no-input-awaited (defensive)', () => {
    const room = makeMockRoom(makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }));
    syncChessClock(room, 1_000);
    expect(room.chessClock.active).toBe('player1');
    room.gameState = null;
    syncChessClock(room, 5_000);
    expect(room.chessClock.active).toBe(null);
    expect(room.chessClockLastInputKey).toBe(null);
  });
});
