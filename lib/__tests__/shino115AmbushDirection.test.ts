import { describe, it, expect, beforeAll } from 'vitest';
import { mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import { initializeRegistry, getEffectHandler } from '../effects/EffectRegistry';
import type { EffectContext } from '../effects/EffectTypes';
import type { CharacterInPlay, GameState } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

function makeMission(p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  return { card: mockMission(), rank: 'D' as const, basePoints: 3, rankBonus: 1, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

function shino(instanceId: string): CharacterInPlay {
  return mockCharInPlay({ instanceId }, {
    id: 'KS-115-R', number: 115, name_fr: 'SHINO ABURAME', group: 'Leaf Village', keywords: ['Team 8', 'Jutsu'],
    effects: [
      { type: 'MAIN', description: '[⧗] Friendly characters in this mission cannot be hidden by enemy effects.' },
      { type: 'AMBUSH', description: 'Move one friendly character from another mission into this mission.' },
    ],
  });
}

function ally(instanceId: string, nameFr: string): CharacterInPlay {
  return mockCharInPlay({ instanceId }, {
    id: 'KS-001-C', number: 1, name_fr: nameFr, group: 'Leaf Village', effects: [],
  });
}

function ctxFor(state: GameState, source: CharacterInPlay, missionIndex: number): EffectContext {
  return { state, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: missionIndex, triggerType: 'AMBUSH', isUpgrade: false };
}

describe('Shino Aburame 115 AMBUSH pulls a character INTO his mission', () => {
  it('offers the effect when a friendly character stands on another mission', () => {
    const source = shino('shino-1');
    const state = createActionPhaseState({
      activeMissions: [
        makeMission([source]),
        makeMission([ally('ally-far', 'KIBA INUZUKA')]),
      ],
    });

    const result = getEffectHandler('KS-115-R', 'AMBUSH')!(ctxFor(state, source, 0));

    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SHINO115_CONFIRM_AMBUSH');
    expect(result.isOptional).toBe(true);
  });

  it('does nothing when the only other friendly character is already in his mission', () => {
    const source = shino('shino-1');
    const state = createActionPhaseState({
      activeMissions: [
        makeMission([source, ally('ally-same', 'KIBA INUZUKA')]),
        makeMission(),
      ],
    });

    const result = getEffectHandler('KS-115-R', 'AMBUSH')!(ctxFor(state, source, 0));

    expect(result.requiresTargetSelection).toBeFalsy();
    expect(result.state.log[result.state.log.length - 1].action).toBe('EFFECT_NO_TARGET');
  });

  it('ignores enemy characters standing on another mission', () => {
    const source = shino('shino-1');
    const state = createActionPhaseState({
      activeMissions: [
        makeMission([source]),
        makeMission([], [ally('enemy-far', 'KIBA INUZUKA')]),
      ],
    });

    const result = getEffectHandler('KS-115-R', 'AMBUSH')!(ctxFor(state, source, 0));

    expect(result.requiresTargetSelection).toBeFalsy();
  });

  it('refuses a character whose name is already visible in his mission', () => {
    const source = shino('shino-1');
    const state = createActionPhaseState({
      activeMissions: [
        makeMission([source, ally('ally-here', 'KIBA INUZUKA')]),
        makeMission([ally('ally-far', 'KIBA INUZUKA')]),
      ],
    });

    const result = getEffectHandler('KS-115-R', 'AMBUSH')!(ctxFor(state, source, 0));

    expect(result.requiresTargetSelection).toBeFalsy();
  });

  it('applies the same behaviour to the rare art variant', () => {
    const source = shino('shino-1');
    const state = createActionPhaseState({
      activeMissions: [
        makeMission([source]),
        makeMission([ally('ally-far', 'KIBA INUZUKA')]),
      ],
    });

    const result = getEffectHandler('KS-115-RA', 'AMBUSH')!(ctxFor(state, source, 0));

    expect(result.requiresTargetSelection).toBe(true);
  });
});
