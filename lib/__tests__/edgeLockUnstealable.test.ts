import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { grantEdge } from '@/lib/engine/rules/edge';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState, PendingEffect } from '@/lib/engine/types';

const KAKASHI = 'KS-148-M';

function lockedBoard(): GameState {
  const state = buildSimState({
    p1: [simChar(KAKASHI, { owner: 'player1', instanceId: 'k1' })],
    p2: [simChar(KAKASHI, { owner: 'player2', instanceId: 'k2' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player2',
  });
  state.phase = 'action';
  return { ...state, edgeHolder: 'player1', edgeLockedFor: 'player1' };
}

function confirmKakashi(state: GameState, player: 'player1' | 'player2', instanceId: string): GameState {
  const pending: PendingEffect = {
    id: 'k-pending',
    sourceCardId: KAKASHI,
    sourceInstanceId: instanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: JSON.stringify({}),
    targetSelectionType: 'KAKASHI148_CONFIRM_MAIN',
    sourcePlayer: player,
    requiresTargetSelection: true,
    validTargets: [instanceId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
  const withPending: GameState = {
    ...state,
    activePlayer: player,
    pendingEffects: [...state.pendingEffects, pending],
    pendingActions: [...state.pendingActions, {
      id: 'k-action',
      type: 'SELECT_TARGET',
      player,
      description: '',
      options: [instanceId],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: 'k-pending',
    }],
  };
  return GameEngine.applyAction(withPending, player, {
    type: 'SELECT_TARGET', pendingActionId: 'k-action', selectedTargets: [instanceId],
  });
}

describe('a locked Edge cannot be taken by anything for the rest of the round', () => {
  beforeAll(() => { initializeRegistry(); });

  it('the fixture starts locked for player1', () => {
    const state = lockedBoard();
    expect(state.edgeHolder).toBe('player1');
    expect(state.edgeLockedFor).toBe('player1');
  });

  it('the opponent own Kakashi 148 cannot steal it', () => {
    const after = confirmKakashi(lockedBoard(), 'player2', 'k2');
    expect(after.edgeHolder, 'the second Kakashi must not take the Edge').toBe('player1');
    expect(after.edgeLockedFor, 'the original lock must survive').toBe('player1');
  });

  it('the opponent Kakashi 148 handler refuses before even asking', () => {
    const handler = getEffectHandler(KAKASHI, 'MAIN');
    expect(handler).toBeTruthy();
    const state = lockedBoard();
    const source = state.activeMissions[0].player2Characters.find((c) => c.instanceId === 'k2')!;
    const result = handler!({
      state, sourcePlayer: 'player2', sourceCard: source,
      sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false,
    });
    expect(result.requiresTargetSelection, 'no prompt may open for a locked out player').toBeFalsy();
    expect(result.state.edgeHolder).toBe('player1');
  });

  it('a copied Kakashi 148 effect cannot steal it either', () => {
    const state = lockedBoard();
    const copier: PendingEffect = {
      id: 'copy-pending',
      sourceCardId: 'KS-016-UC',
      sourceInstanceId: 'k2',
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: '',
      targetSelectionType: 'COPY_EFFECT',
      sourcePlayer: 'player2',
      requiresTargetSelection: false,
      validTargets: [],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    };
    const kakashiCard = state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'k1')!.card;

    const after = EffectEngine.executeCopiedEffect(state, copier, kakashiCard, 'MAIN');

    expect(after.edgeHolder, 'a copy is still a Kakashi 148 effect').toBe('player1');
    expect(after.edgeLockedFor).toBe('player1');

    let resolved = after;
    for (let guard = 0; guard < 4 && resolved.pendingActions.length > 0; guard += 1) {
      const pa = resolved.pendingActions[0];
      resolved = GameEngine.applyAction(resolved, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]],
      });
    }
    expect(resolved.edgeHolder, 'not even after answering every prompt the copy opened').toBe('player1');
    expect(resolved.edgeLockedFor).toBe('player1');
  });

  it('the generic grant helper refuses the locked out player', () => {
    const state = lockedBoard();
    expect(grantEdge(state, 'player2').edgeHolder).toBe('player1');
  });

  it('the lock holder keeps the Edge when using a second Kakashi of their own', () => {
    const after = confirmKakashi(lockedBoard(), 'player1', 'k1');
    expect(after.edgeHolder).toBe('player1');
    expect(after.edgeLockedFor).toBe('player1');
  });

  it('the lock is released for the next round', () => {
    const state = lockedBoard();
    const cleared = { ...state, edgeLockedFor: null };
    expect(grantEdge(cleared, 'player2').edgeHolder).toBe('player2');
  });
});

describe('a real game: no copier can take a locked Edge off the board', () => {
  beforeAll(() => { initializeRegistry(); });

  const COPIERS = ['KS-016-UC', 'KS-106-R', 'KS-106-RA', 'KS-062-UC'];

  function answerEveryPrompt(state: GameState, limit = 12): GameState {
    let s = state;
    for (let guard = 0; guard < limit && s.pendingActions.length > 0; guard += 1) {
      const pa = s.pendingActions[0];
      if (!pa.options || pa.options.length === 0) break;
      s = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]],
      });
    }
    return s;
  }

  for (const copier of COPIERS) {
    it(`${copier} copying Kakashi Original Team 7 leaves the Edge where it is`, () => {
      const card = getCardById(copier);
      expect(card, `${copier} must exist`).toBeTruthy();

      let s = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 30, edgeHolder: 'player2' });
      s.phase = 'action';
      s.activePlayer = 'player1';
      s.player1.chakra = 40;
      s.player2.chakra = 40;
      s.player1.hand = [getCardById(KAKASHI) as CharacterCard];
      s.player2.hand = [card as CharacterCard];

      s = answerEveryPrompt(GameEngine.applyAction(s, 'player1', {
        type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
      }));
      expect(s.edgeHolder, 'the lock holder must own the Edge first').toBe('player1');
      expect(s.edgeLockedFor).toBe('player1');

      s.activePlayer = 'player2';
      const done = answerEveryPrompt(GameEngine.applyAction(s, 'player2', {
        type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
      }));

      expect(done.edgeHolder, `${copier} took a locked Edge`).toBe('player1');
      expect(done.edgeLockedFor, 'the lock must survive the copy').toBe('player1');
    });
  }
});
