import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { generateInstanceId } from '@/lib/engine/utils/id';
import type { GameState, PendingEffect } from '@/lib/engine/types';

function placeEnemy(state: GameState, power: number, name: string, missionIndex: number) {
  const char = mockCharInPlay({
    instanceId: generateInstanceId(),
    controlledBy: 'player2',
    originalOwner: 'player2',
    missionIndex,
  }, {
    id: `enemy-${name}`,
    number: 999,
    name_fr: name,
    chakra: 3,
    power,
    group: 'Independent',
  });
  state.activeMissions[missionIndex].player2Characters.push(char);
  return char;
}

function setupShizune006(): { state: GameState; pending: PendingEffect; shizuneInstanceId: string } {
  const mission1 = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
  const mission2 = { card: mockMission({ id: 'm2' }), rank: 'C' as const, basePoints: 3, rankBonus: 2, player1Characters: [], player2Characters: [], wonBy: null };
  const state = createActionPhaseState({ activeMissions: [mission1, mission2] });

  const shizuneInstanceId = generateInstanceId();
  const shizune = mockCharInPlay({
    instanceId: shizuneInstanceId,
    controlledBy: 'player1',
    originalOwner: 'player1',
    missionIndex: 0,
  }, {
    id: 'KS-006-UC',
    number: 6,
    name_fr: 'SHIZUNE',
    chakra: 3,
    power: 2,
    keywords: ['Weapon'],
    group: 'Leaf Village',
    effects: [{ type: 'MAIN', description: 'Move an enemy character with Power 3 or less in play.' }],
  });
  state.activeMissions[0].player1Characters.push(shizune);

  const pending: PendingEffect = {
    id: generateInstanceId(),
    sourceCardId: 'KS-006-UC',
    sourceInstanceId: shizuneInstanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: JSON.stringify({ sourceCardInstanceId: shizuneInstanceId }),
    targetSelectionType: 'SHIZUNE006_CONFIRM_MAIN',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [shizuneInstanceId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
  state.pendingEffects.push(pending);

  return { state, pending, shizuneInstanceId };
}

describe('Shizune 006 MAIN — Power threshold for "3 or less" targeting', () => {
  it('includes an enemy with Power exactly 3 as a valid target', () => {
    const { state, shizuneInstanceId } = setupShizune006();
    const enemyP3 = placeEnemy(state, 3, 'ENEMY3', 0);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [shizuneInstanceId]);

    const targetPending = newState.pendingEffects.find(p => p.targetSelectionType === 'MOVE_ENEMY_POWER_3_OR_LESS');
    expect(targetPending).toBeDefined();
    expect(targetPending!.validTargets).toContain(enemyP3.instanceId);
  });

  it('includes an enemy with Power 2 as a valid target', () => {
    const { state, shizuneInstanceId } = setupShizune006();
    const enemyP2 = placeEnemy(state, 2, 'ENEMY2', 0);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [shizuneInstanceId]);

    const targetPending = newState.pendingEffects.find(p => p.targetSelectionType === 'MOVE_ENEMY_POWER_3_OR_LESS');
    expect(targetPending).toBeDefined();
    expect(targetPending!.validTargets).toContain(enemyP2.instanceId);
  });

  it('includes an enemy with Power 1 as a valid target', () => {
    const { state, shizuneInstanceId } = setupShizune006();
    const enemyP1 = placeEnemy(state, 1, 'ENEMY1', 0);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [shizuneInstanceId]);

    const targetPending = newState.pendingEffects.find(p => p.targetSelectionType === 'MOVE_ENEMY_POWER_3_OR_LESS');
    expect(targetPending).toBeDefined();
    expect(targetPending!.validTargets).toContain(enemyP1.instanceId);
  });

  it('excludes an enemy with Power 4', () => {
    const { state, shizuneInstanceId } = setupShizune006();
    const enemyP4 = placeEnemy(state, 4, 'ENEMY4', 0);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [shizuneInstanceId]);

    const targetPending = newState.pendingEffects.find(p => p.targetSelectionType === 'MOVE_ENEMY_POWER_3_OR_LESS');
    if (targetPending) {
      expect(targetPending.validTargets).not.toContain(enemyP4.instanceId);
    }
  });

  it('includes multiple Power-3 enemies in different missions', () => {
    const { state, shizuneInstanceId } = setupShizune006();
    const e1 = placeEnemy(state, 3, 'KIBA', 0);
    const e2 = placeEnemy(state, 3, 'CHOJI', 1);

    const newState = EffectEngine.applyTargetedEffect(state, state.pendingEffects[0], [shizuneInstanceId]);

    const targetPending = newState.pendingEffects.find(p => p.targetSelectionType === 'MOVE_ENEMY_POWER_3_OR_LESS');
    expect(targetPending).toBeDefined();
    expect(targetPending!.validTargets).toContain(e1.instanceId);
    expect(targetPending!.validTargets).toContain(e2.instanceId);
  });
});
