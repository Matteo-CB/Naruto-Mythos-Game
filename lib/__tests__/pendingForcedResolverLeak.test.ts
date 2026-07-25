import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { createActionPhaseState } from './testHelpers';
import { whoseInputIsAwaited, computeAwaitedInputKey } from '@/lib/socket/server';
import type { GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';

function forcedChoiceEffect(sourcePlayer: PlayerID, selectingPlayer: PlayerID): PendingEffect {
  return {
    id: 'eff-forced',
    sourceCardId: 'KS-069-C',
    sourceInstanceId: 'inst-forced',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: '{}',
    targetSelectionType: 'DOSU069_OPPONENT_CHOICE',
    sourcePlayer,
    selectingPlayer,
    requiresTargetSelection: true,
    validTargets: ['a', 'b'],
    isOptional: true,
    isMandatory: false,
    rootOptional: true,
    resolved: false,
    isUpgrade: false,
  };
}

function forcedChoiceAction(player: PlayerID): PendingAction {
  return {
    id: 'pa-forced',
    type: 'SELECT_TARGET',
    player,
    description: 'The opponent chooses',
    options: ['a', 'b'],
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: 'eff-forced',
  } as PendingAction;
}

function stateWithForcedChoice(opponentHasPassed: boolean): GameState {
  const state = createActionPhaseState();
  state.activePlayer = 'player1';
  state.player1.hasPassed = false;
  state.player2.hasPassed = opponentHasPassed;
  state.pendingEffects = [forcedChoiceEffect('player1', 'player2')];
  state.pendingActions = [forcedChoiceAction('player2')];
  state.pendingForcedResolver = 'player2';
  return state;
}

describe('pendingForcedResolver is always cleared once the forced choice resolves', () => {
  it('clears it when both players are still active (regression guard for the original behaviour)', () => {
    const before = stateWithForcedChoice(false);
    const after = GameEngine.applyAction(before, 'player2', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: 'eff-forced',
    });

    expect(after.pendingActions.length).toBe(0);
    expect(after.pendingEffects.length).toBe(0);
    expect(after.pendingForcedResolver).toBeUndefined();
    expect(after.activePlayer).toBe('player2');
  });

  it('clears it when the opponent has already passed, instead of leaking it for the rest of the game', () => {
    const before = stateWithForcedChoice(true);
    const after = GameEngine.applyAction(before, 'player2', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: 'eff-forced',
    });

    expect(after.pendingActions.length).toBe(0);
    expect(after.pendingEffects.length).toBe(0);
    expect(after.pendingForcedResolver).toBeUndefined();
  });

  it('leaves the turn with the still-active player when the opponent has passed', () => {
    const before = stateWithForcedChoice(true);
    const after = GameEngine.applyAction(before, 'player2', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: 'eff-forced',
    });

    expect(after.activePlayer).toBe('player1');
  });

  it('does not arm the clock on a player who has nothing to click after the forced choice', () => {
    const before = stateWithForcedChoice(true);
    const after = GameEngine.applyAction(before, 'player2', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: 'eff-forced',
    });

    expect(whoseInputIsAwaited(after)).toBe('player1');
    expect(computeAwaitedInputKey(after)).not.toBe('forced:player2');
  });

  it('a stale resolver left on an old state can no longer capture the clock', () => {
    const stale = createActionPhaseState();
    stale.activePlayer = 'player1';
    stale.player2.hasPassed = true;
    stale.pendingForcedResolver = 'player2';
    stale.pendingActions = [];
    stale.pendingEffects = [];

    expect(whoseInputIsAwaited(stale)).toBe('player1');
  });

  it('is cleared by every phase transition, so it can never span a round', () => {
    const state = createActionPhaseState();
    state.pendingForcedResolver = 'player2';
    state.pendingActions = [];
    state.pendingEffects = [];

    expect(GameEngine.transitionToMissionPhase(state).pendingForcedResolver).toBeUndefined();

    const endState = createActionPhaseState();
    endState.pendingForcedResolver = 'player2';
    endState.pendingActions = [];
    endState.pendingEffects = [];
    const afterEnd = GameEngine.transitionToEndPhase(endState);
    expect(afterEnd.pendingForcedResolver).toBeUndefined();
  });
});

describe('stale pending references never silently steal a turn', () => {
  it('ignores a SELECT_TARGET whose pending action no longer exists', () => {
    const state = createActionPhaseState();
    state.activePlayer = 'player2';
    state.pendingActions = [];
    state.pendingEffects = [];

    const after = GameEngine.applyAction(state, 'player2', {
      type: 'SELECT_TARGET',
      pendingActionId: 'already-resolved-id',
      selectedTargets: ['whatever'],
    });

    expect(after.activePlayer).toBe('player2');
    expect(after.log.length).toBe(state.log.length);
  });

  it('ignores a DECLINE whose pending effect no longer exists', () => {
    const state = createActionPhaseState();
    state.activePlayer = 'player2';
    state.pendingActions = [];
    state.pendingEffects = [];

    const after = GameEngine.applyAction(state, 'player2', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: 'gone',
    });

    expect(after.activePlayer).toBe('player2');
  });
});

describe('REORDER_EFFECTS authorises the decider, not the effect owner', () => {
  function twoSimultaneousChoices(): GameState {
    const state = createActionPhaseState();
    state.activePlayer = 'player1';
    state.pendingEffects = [
      {
        ...forcedChoiceEffect('player2', 'player2'),
        id: 'e-mine',
        sourceInstanceId: 'inst-mine',
        targetSelectionType: 'character',
      },
      {
        ...forcedChoiceEffect('player1', undefined as unknown as PlayerID),
        id: 'e-opp',
        sourceInstanceId: 'inst-opp',
        targetSelectionType: 'ZAKU070_CONFIRM_MAIN',
      },
    ];
    state.pendingActions = [
      { ...forcedChoiceAction('player2'), id: 'pa-mine', sourceEffectId: 'e-mine' },
      { ...forcedChoiceAction('player2'), id: 'pa-opp', sourceEffectId: 'e-opp' },
    ];
    return state;
  }

  it('reorders an opponent-sourced effect when the decider is the clicking player', () => {
    const state = twoSimultaneousChoices();
    const after = GameEngine.handleReorderEffects(state, 'player2', 'e-opp');

    expect(after.pendingEffects[0].id).toBe('e-opp');
    expect(after.pendingActions[0].id).toBe('pa-opp');
    expect((after as unknown as { effectOrderResolved?: boolean }).effectOrderResolved).toBe(true);
  });

  it('is not a byte-identical no-op any more, so the order popup cannot loop forever', () => {
    const state = twoSimultaneousChoices();
    const after = GameEngine.handleReorderEffects(state, 'player2', 'e-opp');
    expect(after).not.toBe(state);
    expect(after.pendingEffects.map((e) => e.id)).not.toEqual(state.pendingEffects.map((e) => e.id));
  });

  it('still refuses a reorder requested by someone who is not the decider', () => {
    const state = twoSimultaneousChoices();
    const after = GameEngine.handleReorderEffects(state, 'player1', 'e-opp');
    expect(after).toBe(state);
  });

  it('resolves the decider from the backing pending action, then from selectingPlayer, then from sourcePlayer', () => {
    const state = twoSimultaneousChoices();
    expect(GameEngine.resolveEffectDecider(state, 'e-opp')).toBe('player2');

    const noAction = { ...state, pendingActions: [] } as GameState;
    expect(GameEngine.resolveEffectDecider(noAction, 'e-mine')).toBe('player2');
    expect(GameEngine.resolveEffectDecider(noAction, 'e-opp')).toBe('player1');
    expect(GameEngine.resolveEffectDecider(noAction, 'nope')).toBe(null);
  });
});

describe('a player always sees the effect backing a pending action addressed to them', () => {
  it('ships an opponent-sourced pending effect to the decider', () => {
    const state = createActionPhaseState();
    state.pendingEffects = [
      {
        ...forcedChoiceEffect('player1', undefined as unknown as PlayerID),
        id: 'e-opp',
        targetSelectionType: 'MSS03_OPPONENT_DISCARD',
      },
    ];
    state.pendingActions = [{ ...forcedChoiceAction('player2'), sourceEffectId: 'e-opp' }];

    const visible = GameEngine.getVisibleState(state, 'player2');
    expect(visible.pendingActions.length).toBe(1);
    expect(visible.pendingEffects.map((e) => e.id)).toContain('e-opp');
  });

  it('still hides an opponent effect that has no pending action for the viewer', () => {
    const state = createActionPhaseState();
    state.pendingEffects = [
      { ...forcedChoiceEffect('player1', undefined as unknown as PlayerID), id: 'e-secret' },
    ];
    state.pendingActions = [];

    const visible = GameEngine.getVisibleState(state, 'player2');
    expect(visible.pendingEffects.map((e) => e.id)).not.toContain('e-secret');
  });
});
