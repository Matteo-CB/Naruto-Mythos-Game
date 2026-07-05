import { describe, it, expect, beforeAll } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import { registerAllSetHandlers } from '../effects/handlers';
import { createActionPhaseState, mockCharInPlay, mockCharacter } from './testHelpers';
import type { PendingEffect, EffectType } from '../engine/types';

beforeAll(() => registerAllSetHandlers());

function setup() {
  const state = createActionPhaseState({});
  const sasuke = mockCharInPlay(
    { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
    { id: 'KS-014-UC', number: 14, name_fr: 'SASUKE UCHIWA', chakra: 3, power: 3 },
  );
  state.activeMissions[0].player1Characters = [sasuke];
  state.player1.hand = [mockCharacter({ id: 'KS-001-C', name_fr: 'A' }), mockCharacter({ id: 'KS-002-C', name_fr: 'B' })];
  state.player2.hand = [mockCharacter({ id: 'KS-003-C', name_fr: 'X' }), mockCharacter({ id: 'KS-004-C', name_fr: 'Y' })];
  return { state, sasuke };
}

function confirmAmbushPending(sourceInstanceId: string, isUpgrade: boolean): PendingEffect {
  return {
    id: 'pe-s014', sourceCardId: 'KS-014-UC', sourceInstanceId, sourceMissionIndex: 0,
    effectType: 'AMBUSH' as EffectType, effectDescription: JSON.stringify({ isUpgrade }),
    targetSelectionType: 'SASUKE014_CONFIRM_AMBUSH', sourcePlayer: 'player1',
    requiresTargetSelection: true, validTargets: [sourceInstanceId],
    isOptional: true, isMandatory: false, resolved: false, isUpgrade,
  };
}

describe('Sasuke 014 — upgrade decision comes BEFORE the hand is revealed', () => {
  it('upgrade: confirming the ambush asks the discard-modifier first, hand NOT yet revealed', () => {
    const { state, sasuke } = setup();
    const pending = confirmAmbushPending(sasuke.instanceId, true);
    const logLenBefore = state.log.length;

    const s1 = EffectEngine.applyTargetedEffect(state, pending, [sasuke.instanceId]);

    expect(s1.pendingEffects.some(pe => pe.targetSelectionType === 'SASUKE014_CONFIRM_UPGRADE_MODIFIER')).toBe(true);
    expect(s1.pendingEffects.some(pe => pe.targetSelectionType === 'SASUKE014_HAND_REVEAL')).toBe(false);
    const newLogs = s1.log.slice(logLenBefore);
    expect(newLogs.some(l => l.action === 'EFFECT_LOOK_HAND')).toBe(false);
  });

  it('upgrade: confirming the modifier THEN reveals the hand', () => {
    const { state, sasuke } = setup();
    const s1 = EffectEngine.applyTargetedEffect(state, confirmAmbushPending(sasuke.instanceId, true), [sasuke.instanceId]);
    const modifier = s1.pendingEffects.find(pe => pe.targetSelectionType === 'SASUKE014_CONFIRM_UPGRADE_MODIFIER')!;
    const s2 = EffectEngine.applyTargetedEffect(s1, modifier, [sasuke.instanceId]);

    const reveal = s2.pendingEffects.find(pe => pe.targetSelectionType === 'SASUKE014_HAND_REVEAL');
    expect(reveal).toBeTruthy();
    expect(s2.log.some(l => l.action === 'EFFECT_LOOK_HAND')).toBe(true);
    let meta: { applyModifier?: boolean } = {};
    try { meta = JSON.parse(reveal!.effectDescription); } catch { /* ignore */ }
    expect(meta.applyModifier).toBe(true);
  });

  it('non-upgrade: confirming the ambush reveals the hand directly (no modifier)', () => {
    const { state, sasuke } = setup();
    const s1 = EffectEngine.applyTargetedEffect(state, confirmAmbushPending(sasuke.instanceId, false), [sasuke.instanceId]);
    expect(s1.pendingEffects.some(pe => pe.targetSelectionType === 'SASUKE014_HAND_REVEAL')).toBe(true);
    expect(s1.pendingEffects.some(pe => pe.targetSelectionType === 'SASUKE014_CONFIRM_UPGRADE_MODIFIER')).toBe(false);
    expect(s1.log.some(l => l.action === 'EFFECT_LOOK_HAND')).toBe(true);
  });
});
