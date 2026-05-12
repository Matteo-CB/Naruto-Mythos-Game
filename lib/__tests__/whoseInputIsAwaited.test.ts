import { describe, it, expect } from 'vitest';
import { whoseInputIsAwaited } from '@/lib/socket/server';
import type { GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';


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

  it('returns pending forced resolver above all other priorities', () => {
    const s = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: 'player2',
      pendingActions: [makePendingAction('player1')],
    });
    expect(whoseInputIsAwaited(s)).toBe('player2');
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
});
