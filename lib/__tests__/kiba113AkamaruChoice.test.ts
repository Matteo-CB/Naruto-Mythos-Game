import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { PendingEffect, EffectType } from '../engine/types';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

function makeConfirmMainPending(
  selType: 'KIBA113_CONFIRM_MAIN' | 'KIBA149_CONFIRM_MAIN',
  sourceInstanceId: string,
  sourceMissionIndex = 0,
): PendingEffect {
  return {
    id: 'pe-confirm',
    sourceCardId: selType === 'KIBA149_CONFIRM_MAIN' ? 'KS-113-MV' : 'KS-113-R',
    sourceInstanceId,
    sourceMissionIndex,
    effectType: 'MAIN' as EffectType,
    effectDescription: JSON.stringify({
      sourceMissionIndex,
      sourceCardInstanceId: sourceInstanceId,
      isUpgrade: 'false',
    }),
    targetSelectionType: selType,
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [sourceInstanceId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
}

describe('Kiba 113 R + 113 MV: player chooses which Akamaru to hide (not auto-leftmost)', () => {
  it('Rare (KS-113-R): queues KIBA113_CHOOSE_AKAMARU with all friendly Akamarus as valid targets', () => {
    const state = createActionPhaseState({});
    const kiba = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-113-R', name_fr: 'Kiba Inuzuka', chakra: 5, power: 5, number: 113 },
    );
    const akamaru1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-027-C', name_fr: 'Akamaru', chakra: 1, power: 1, number: 27 },
    );
    const akamaru2 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-028-UC', name_fr: 'Akamaru', chakra: 2, power: 2, number: 28 },
    );
    const akamaru3 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-029-UC', name_fr: 'Akamaru', chakra: 3, power: 3, number: 29 },
    );
    state.activeMissions[0].player1Characters = [kiba, akamaru1, akamaru2, akamaru3];

    const pending = makeConfirmMainPending('KIBA113_CONFIRM_MAIN', kiba.instanceId);
    const newState = EffectEngine.kiba113QueueAkamaruChoice(state, pending, false);

    const choosePending = newState.pendingEffects.find((e) => e.targetSelectionType === 'KIBA113_CHOOSE_AKAMARU');
    expect(choosePending).toBeDefined();
    expect(choosePending!.validTargets).toHaveLength(3);
    expect(choosePending!.validTargets).toContain(akamaru1.instanceId);
    expect(choosePending!.validTargets).toContain(akamaru2.instanceId);
    expect(choosePending!.validTargets).toContain(akamaru3.instanceId);

    expect(state.activeMissions[0].player1Characters.every((c) => !c.isHidden)).toBe(true);
  });

  it('Mythos (KS-113-MV): queues KIBA149_CHOOSE_AKAMARU with all friendly Akamarus (NOT auto-leftmost)', () => {
    const state = createActionPhaseState({});
    const kiba = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-113-MV', name_fr: 'Kiba Inuzuka', chakra: 5, power: 5, number: 113 },
    );
    const akamaru1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-027-C', name_fr: 'Akamaru', chakra: 1, power: 1, number: 27 },
    );
    const akamaru2 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-028-UC', name_fr: 'Akamaru', chakra: 2, power: 2, number: 28 },
    );
    const akamaru3 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-029-UC', name_fr: 'Akamaru', chakra: 3, power: 3, number: 29 },
    );
    state.activeMissions[0].player1Characters = [kiba, akamaru1, akamaru2, akamaru3];

    const pending = makeConfirmMainPending('KIBA149_CONFIRM_MAIN', kiba.instanceId);
    const newState = EffectEngine.kiba149ExecuteStep1(state, pending, false);

    const choosePending = newState.pendingEffects.find((e) => e.targetSelectionType === 'KIBA149_CHOOSE_AKAMARU');
    expect(choosePending).toBeDefined();
    expect(choosePending!.validTargets).toHaveLength(3);
    expect(choosePending!.validTargets).toContain(akamaru1.instanceId);
    expect(choosePending!.validTargets).toContain(akamaru2.instanceId);
    expect(choosePending!.validTargets).toContain(akamaru3.instanceId);

    expect(newState.activeMissions[0].player1Characters.every((c) => !c.isHidden)).toBe(true);
  });

  it('Mythos: no Akamaru in play → fizzles without crash', () => {
    const state = createActionPhaseState({});
    const kiba = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-113-MV', name_fr: 'Kiba Inuzuka', chakra: 5, power: 5, number: 113 },
    );
    state.activeMissions[0].player1Characters = [kiba];

    const pending = makeConfirmMainPending('KIBA149_CONFIRM_MAIN', kiba.instanceId);
    const newState = EffectEngine.kiba149ExecuteStep1(state, pending, false);

    const choosePending = newState.pendingEffects.find((e) => e.targetSelectionType === 'KIBA149_CHOOSE_AKAMARU');
    expect(choosePending).toBeUndefined();
  });

  it('Mythos: kiba149ResolveAkamaruChoice hides the CHOSEN Akamaru, not the leftmost', () => {
    const state = createActionPhaseState({});
    const kiba = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-113-MV', name_fr: 'Kiba Inuzuka', chakra: 5, power: 5, number: 113 },
    );
    const akamaruLeft = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-027-C', name_fr: 'Akamaru', chakra: 1, power: 1, number: 27 },
    );
    const akamaruMiddle = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-028-UC', name_fr: 'Akamaru', chakra: 2, power: 2, number: 28 },
    );
    const enemyToHide = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3, power: 3, number: 10 },
    );
    state.activeMissions[0].player1Characters = [kiba, akamaruLeft, akamaruMiddle];
    state.activeMissions[0].player2Characters = [enemyToHide];

    const akamaruChoosePending: PendingEffect = {
      id: 'pe-akamaru-choose',
      sourceCardId: 'KS-113-MV',
      sourceInstanceId: kiba.instanceId,
      sourceMissionIndex: 0,
      effectType: 'MAIN' as EffectType,
      effectDescription: JSON.stringify({ sourceMissionIndex: 0 }),
      targetSelectionType: 'KIBA149_CHOOSE_AKAMARU',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: [akamaruLeft.instanceId, akamaruMiddle.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    };

    const newState = EffectEngine.kiba149ResolveAkamaruChoice(
      state, akamaruChoosePending, akamaruMiddle.instanceId, false,
    );

    const step2 = newState.pendingEffects.find((e) => e.targetSelectionType === 'KIBA149_CHOOSE_HIDE_TARGET');
    expect(step2).toBeDefined();
    expect(step2!.validTargets).toContain(akamaruLeft.instanceId);
    expect(step2!.validTargets).toContain(enemyToHide.instanceId);
    expect(step2!.validTargets).not.toContain(akamaruMiddle.instanceId);
    expect(step2!.validTargets).not.toContain(kiba.instanceId);
    expect(JSON.parse(step2!.effectDescription).friendlyId).toBe(akamaruMiddle.instanceId);

    const done = EffectEngine.applyTargetedEffect(newState, step2 as never, [enemyToHide.instanceId]);
    const leftAfter = done.activeMissions[0].player1Characters.find((c) => c.instanceId === akamaruLeft.instanceId);
    const middleAfter = done.activeMissions[0].player1Characters.find((c) => c.instanceId === akamaruMiddle.instanceId);
    const enemyAfter = done.activeMissions[0].player2Characters.find((c) => c.instanceId === enemyToHide.instanceId);
    expect(leftAfter?.isHidden).toBe(false);
    expect(middleAfter?.isHidden).toBe(true);
    expect(enemyAfter?.isHidden).toBe(true);
  });
});
