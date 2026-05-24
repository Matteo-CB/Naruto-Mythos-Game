import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState, mockCharacter } from './testHelpers';
import { generateInstanceId } from '@/lib/engine/utils/id';
import '@/lib/effects/EffectRegistry';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import type { GameState } from '@/lib/engine/types';

function setupKimimaro123Upgrade(): { state: GameState; kimimaroId: string } {
  const m1 = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
  const state = createActionPhaseState({ activeMissions: [m1] });

  state.player1.hand = [mockCharacter({ id: 'KS-001-C', name_fr: 'CARD', chakra: 1, power: 1 })];

  const kimimaroId = generateInstanceId();
  const kimimaro = mockCharInPlay({
    instanceId: kimimaroId,
    controlledBy: 'player1',
    originalOwner: 'player1',
    missionIndex: 0,
  }, {
    id: 'KS-123-R',
    number: 123,
    name_fr: 'KIMIMARO',
    chakra: 6,
    power: 8,
    keywords: ['Jutsu'],
    group: 'Sound Village',
  });
  state.activeMissions[0].player1Characters.push(kimimaro);

  return { state, kimimaroId };
}

describe('Kimimaro 123 UPGRADE — defeating hidden enemies', () => {
  it('includes a hidden high-cost enemy as a valid defeat target (hidden = cost 0)', () => {
    const { state, kimimaroId } = setupKimimaro123Upgrade();

    const hiddenEnemy = mockCharInPlay({
      instanceId: generateInstanceId(),
      isHidden: true,
      wasRevealedAtLeastOnce: false,
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-135-S',
      number: 135,
      name_fr: 'SAKURA HARUNO',
      chakra: 8,
      power: 8,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(hiddenEnemy);

    const handler = getEffectHandler('KS-123-R', 'UPGRADE');
    expect(handler).toBeDefined();

    const result = handler!({
      state,
      sourcePlayer: 'player1',
      sourceCard: state.activeMissions[0].player1Characters.find(c => c.instanceId === kimimaroId)!,
      sourceMissionIndex: 0,
      triggerType: 'UPGRADE',
      isUpgrade: true,
    });

    expect(result.requiresTargetSelection).toBe(true);
  });

  it('excludes a face-up enemy with printed cost above 5', () => {
    const { state, kimimaroId } = setupKimimaro123Upgrade();

    const enemy7 = mockCharInPlay({
      instanceId: generateInstanceId(),
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-130-R',
      number: 130,
      name_fr: 'ICHIBI',
      chakra: 7,
      power: 7,
      group: 'Sand Village',
    });
    state.activeMissions[0].player2Characters.push(enemy7);

    const handler = getEffectHandler('KS-123-R', 'UPGRADE');
    expect(handler).toBeDefined();

    const result = handler!({
      state,
      sourcePlayer: 'player1',
      sourceCard: state.activeMissions[0].player1Characters.find(c => c.instanceId === kimimaroId)!,
      sourceMissionIndex: 0,
      triggerType: 'UPGRADE',
      isUpgrade: true,
    });

    expect(result.requiresTargetSelection).toBeFalsy();
  });

  it('includes face-up enemy with printed cost <= 5', () => {
    const { state, kimimaroId } = setupKimimaro123Upgrade();

    const enemy4 = mockCharInPlay({
      instanceId: generateInstanceId(),
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-100-C',
      number: 100,
      name_fr: 'SHIKAMARU',
      chakra: 4,
      power: 4,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(enemy4);

    const handler = getEffectHandler('KS-123-R', 'UPGRADE');
    expect(handler).toBeDefined();

    const result = handler!({
      state,
      sourcePlayer: 'player1',
      sourceCard: state.activeMissions[0].player1Characters.find(c => c.instanceId === kimimaroId)!,
      sourceMissionIndex: 0,
      triggerType: 'UPGRADE',
      isUpgrade: true,
    });

    expect(result.requiresTargetSelection).toBe(true);
  });
});
