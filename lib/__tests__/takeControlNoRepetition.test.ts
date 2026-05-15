import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { PendingEffect, EffectType } from '../engine/types';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

function makePending(sourcePlayer: 'player1' | 'player2', sourceInstanceId = 'inst-ino'): PendingEffect {
  return {
    id: 'pe-takecontrol',
    sourceCardId: 'KS-020-UC',
    sourceInstanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN' as EffectType,
    effectDescription: '',
    targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    sourcePlayer,
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  };
}

describe('takeControlOfEnemy — No Repetition rule (2026-05-14)', () => {
  it('transfers face-up enemy with no conflict (happy path)', () => {
    const state = createActionPhaseState({});
    const stolen = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [stolen];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), stolen.instanceId);

    expect(newState.activeMissions[0].player2Characters).toHaveLength(0);
    expect(newState.activeMissions[0].player1Characters).toHaveLength(1);
    const transferred = newState.activeMissions[0].player1Characters[0];
    expect(transferred.controlledBy).toBe('player1');
    expect(transferred.originalOwner).toBe('player2');
    expect(transferred.controllerInstanceId).toBe('inst-ino');
    expect(state.player2.discardPile).toHaveLength(0);
  });

  it('face-up + face-up same-name → discards new arriving to originalOwner, no defeat', () => {
    const state = createActionPhaseState({});
    const myNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const enemyNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [myNaruto];
    state.activeMissions[0].player2Characters = [enemyNaruto];

    const beforeP1DiscardLen = state.player1.discardPile.length;
    const beforeP2DiscardLen = state.player2.discardPile.length;

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyNaruto.instanceId);

    expect(newState.activeMissions[0].player1Characters).toHaveLength(1);
    expect(newState.activeMissions[0].player1Characters[0].instanceId).toBe(myNaruto.instanceId);
    expect(newState.activeMissions[0].player2Characters).toHaveLength(0);

    expect(newState.player1.discardPile.length).toBe(beforeP1DiscardLen);
    expect(newState.player2.discardPile.length).toBe(beforeP2DiscardLen + 1);
    expect(newState.player2.discardPile[newState.player2.discardPile.length - 1].id).toBe('KS-009-C');
  });

  it('hidden enemy → transferred hidden, no immediate discard (no visible name)', () => {
    const state = createActionPhaseState({});
    const myNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 4 },
    );
    const enemyHidden = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [myNaruto];
    state.activeMissions[0].player2Characters = [enemyHidden];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyHidden.instanceId);

    expect(newState.activeMissions[0].player1Characters).toHaveLength(2);
    expect(newState.activeMissions[0].player2Characters).toHaveLength(0);
    expect(newState.player2.discardPile).toHaveLength(0);
  });

  it('upgraded stack stolen, name conflict with friendly → entire stack discarded to originalOwner', () => {
    const state = createActionPhaseState({});
    const myKakashi = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-106-R', name_fr: 'Kakashi', chakra: 6 },
    );
    const bottomCard = mockCharacter({ id: 'KS-016-UC', name_fr: 'Some Other', chakra: 2 });
    const topCard = mockCharacter({ id: 'KS-148-R', name_fr: 'Kakashi', chakra: 5 });
    const enemyStack = mockCharInPlay(
      {
        controlledBy: 'player2',
        originalOwner: 'player2',
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player1Characters = [myKakashi];
    state.activeMissions[0].player2Characters = [enemyStack];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyStack.instanceId);

    expect(newState.activeMissions[0].player1Characters).toHaveLength(1);
    expect(newState.activeMissions[0].player1Characters[0].instanceId).toBe(myKakashi.instanceId);

    const p2DiscardIds = newState.player2.discardPile.map((c) => c.id);
    expect(p2DiscardIds).toContain('KS-016-UC');
    expect(p2DiscardIds).toContain('KS-148-R');
  });

  it('no conflict when names differ even if face-up vs face-up', () => {
    const state = createActionPhaseState({});
    const mySasuke = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { name_fr: 'Sasuke', chakra: 4 },
    );
    const enemyNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [mySasuke];
    state.activeMissions[0].player2Characters = [enemyNaruto];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyNaruto.instanceId);

    expect(newState.activeMissions[0].player1Characters).toHaveLength(2);
    expect(newState.activeMissions[0].player2Characters).toHaveLength(0);
    expect(newState.player2.discardPile).toHaveLength(0);
  });

  it('returns state unchanged if target instance not found', () => {
    const state = createActionPhaseState({});
    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), 'ghost-id');
    expect(newState).toBe(state);
  });

  it('No Rep discard does NOT trigger defeat (no pendingEffects added)', () => {
    const state = createActionPhaseState({});
    const myNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 4 },
    );
    const enemyNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [myNaruto];
    state.activeMissions[0].player2Characters = [enemyNaruto];

    const pendingBefore = state.pendingEffects.length;
    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyNaruto.instanceId);

    expect(newState.pendingEffects.length).toBe(pendingBefore);
  });

  it('logs takeControlNoRepDiscard key when discard happens', () => {
    const state = createActionPhaseState({});
    const myNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 4 },
    );
    const enemyNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [myNaruto];
    state.activeMissions[0].player2Characters = [enemyNaruto];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyNaruto.instanceId);

    const lastLog = newState.log[newState.log.length - 1];
    expect(lastLog.messageKey).toBe('game.log.effect.takeControlNoRepDiscard');
  });

  it('logs takeControl key (normal) when no conflict', () => {
    const state = createActionPhaseState({});
    const enemyNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [enemyNaruto];

    const newState = EffectEngine.takeControlOfEnemy(state, makePending('player1'), enemyNaruto.instanceId);

    const lastLog = newState.log[newState.log.length - 1];
    expect(lastLog.messageKey).toBe('game.log.effect.takeControl');
  });
});
