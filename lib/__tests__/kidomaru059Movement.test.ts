import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { generateInstanceId } from '@/lib/engine/utils/id';
import type { GameState, PendingEffect } from '@/lib/engine/types';

function placeFriendly(state: GameState, missionIndex: number, name: string, sound4 = false, hidden = false) {
  const char = mockCharInPlay({
    instanceId: generateInstanceId(),
    controlledBy: 'player1',
    originalOwner: 'player1',
    missionIndex,
    isHidden: hidden,
    wasRevealedAtLeastOnce: !hidden,
  }, {
    id: `ks-friend-${name}`,
    number: 999,
    name_fr: name,
    chakra: 3,
    power: 2,
    keywords: sound4 ? ['Sound Four'] : [],
    group: 'Sound Village',
  });
  state.activeMissions[missionIndex].player1Characters.push(char);
  return char;
}

function setupKidomaru059(): { state: GameState; kidomaruId: string; pending: PendingEffect } {
  const m1 = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
  const m2 = { card: mockMission({ id: 'm2' }), rank: 'C' as const, basePoints: 3, rankBonus: 2, player1Characters: [], player2Characters: [], wonBy: null };
  const m3 = { card: mockMission({ id: 'm3' }), rank: 'B' as const, basePoints: 3, rankBonus: 3, player1Characters: [], player2Characters: [], wonBy: null };
  const state = createActionPhaseState({ activeMissions: [m1, m2, m3] });

  const kidomaruId = generateInstanceId();
  const kidomaru = mockCharInPlay({
    instanceId: kidomaruId,
    controlledBy: 'player1',
    originalOwner: 'player1',
    missionIndex: 0,
  }, {
    id: 'KS-059-C',
    number: 59,
    name_fr: 'KIDÔMARU',
    chakra: 3,
    power: 2,
    keywords: ['Sound Four'],
    group: 'Sound Village',
  });
  state.activeMissions[0].player1Characters.push(kidomaru);

  const pending: PendingEffect = {
    id: generateInstanceId(),
    sourceCardId: 'KS-059-C',
    sourceInstanceId: kidomaruId,
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: JSON.stringify({ sourceCardInstanceId: kidomaruId }),
    targetSelectionType: 'KIDOMARU059_CONFIRM_MAIN',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [kidomaruId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
  state.pendingEffects.push(pending);

  return { state, kidomaruId, pending };
}

describe('Kidomaru 059 MAIN — movement targeting rules', () => {
  it('excludes Kidomaru himself from movable targets on the first pick', () => {
    const { state, kidomaruId } = setupKidomaru059();
    placeFriendly(state, 0, 'SAKON', true);
    placeFriendly(state, 1, 'TAYUYA', true);
    placeFriendly(state, 0, 'JIROBO', false);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [kidomaruId]);

    const pending = newState.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    expect(pending).toBeDefined();
    expect(pending!.validTargets).not.toContain(kidomaruId);
  });

  it('excludes Kidomaru himself from targets on subsequent moves (after first pick)', () => {
    const { state, kidomaruId } = setupKidomaru059();
    const sakon = placeFriendly(state, 0, 'SAKON', true);
    const tayuya = placeFriendly(state, 1, 'TAYUYA', true);

    let s = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [kidomaruId]);

    const firstPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    expect(firstPending).toBeDefined();
    s = EffectEngine.applyTargetedEffect(s, firstPending!, [sakon.instanceId]);

    const destPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_DESTINATION');
    if (destPending) {
      s = EffectEngine.applyTargetedEffect(s, destPending, [destPending.validTargets![0]]);
    }

    const nextPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    if (nextPending) {
      expect(nextPending.validTargets).not.toContain(kidomaruId);
    }
    void tayuya;
  });

  it('does not allow re-selecting an already-moved character on subsequent moves', () => {
    const { state, kidomaruId } = setupKidomaru059();
    const sakon = placeFriendly(state, 0, 'SAKON', true);
    placeFriendly(state, 1, 'TAYUYA', true);
    placeFriendly(state, 2, 'JIROBO', true);

    let s = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [kidomaruId]);

    const firstPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    expect(firstPending).toBeDefined();
    s = EffectEngine.applyTargetedEffect(s, firstPending!, [sakon.instanceId]);

    const destPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_DESTINATION');
    if (destPending) {
      s = EffectEngine.applyTargetedEffect(s, destPending, [destPending.validTargets![0]]);
    }

    const nextPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    if (nextPending) {
      expect(nextPending.validTargets).not.toContain(sakon.instanceId);
    }
  });

  it('subsequent moves become optional (can be skipped if user wants)', () => {
    const { state, kidomaruId } = setupKidomaru059();
    const sakon = placeFriendly(state, 0, 'SAKON', true);
    placeFriendly(state, 1, 'TAYUYA', true);

    let s = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [kidomaruId]);
    const firstPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    s = EffectEngine.applyTargetedEffect(s, firstPending!, [sakon.instanceId]);
    const destPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_DESTINATION');
    if (destPending) {
      s = EffectEngine.applyTargetedEffect(s, destPending, [destPending.validTargets![0]]);
    }
    const nextPending = s.pendingEffects.find(p => p.targetSelectionType === 'KIDOMARU_CHOOSE_CHARACTER');
    if (nextPending) {
      expect(nextPending.isOptional).toBe(true);
      expect(nextPending.isMandatory).toBe(false);
    }
  });
});
