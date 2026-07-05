import { describe, it, expect, beforeAll } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import { getEffectHandler } from '../effects/EffectRegistry';
import { registerAllSetHandlers } from '../effects/handlers';
import { moveWouldViolateNameUniqueness } from '../effects/moveNameUniqueness';
import { createActionPhaseState, mockMission, mockCharInPlay } from './testHelpers';
import type { PendingEffect, EffectType } from '../engine/types';
import type { EffectContext } from '../effects/EffectTypes';

beforeAll(() => {
  registerAllSetHandlers();
});

function twoMissions(state: ReturnType<typeof createActionPhaseState>) {
  const m2 = mockMission({ id: 'KS-002-MMS', name_fr: 'M2', basePoints: 4 });
  state.activeMissions = [
    state.activeMissions[0],
    { card: m2, rank: 'C', basePoints: 4, rankBonus: 2, player1Characters: [], player2Characters: [], wonBy: null },
  ];
  return state;
}

describe('Move No-Repetition — bypass paths fixed', () => {
  it('helper detects a same-name conflict on the destination side', () => {
    const state = twoMissions(createActionPhaseState({}));
    const moving = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, { id: 'KS-004-UC', name_fr: 'TSUNADE', chakra: 4 });
    const existing = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1 }, { id: 'KS-004-UC', name_fr: 'TSUNADE', chakra: 4 });
    state.activeMissions[0].player1Characters = [moving];
    state.activeMissions[1].player1Characters = [existing];
    expect(moveWouldViolateNameUniqueness(state, moving, 1, 'player1Characters')).toBe(true);
    expect(moveWouldViolateNameUniqueness(state, moving, 0, 'player1Characters')).toBe(false);
  });

  it('Kankuro 119 blocks moving an enemy character into a same-name mission', () => {
    const state = twoMissions(createActionPhaseState({}));
    const tsunadeM0 = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, { id: 'KS-004-UC', number: 4, name_fr: 'TSUNADE', chakra: 4, power: 4 });
    const tsunadeM1 = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1 }, { id: 'KS-004-UC', number: 4, name_fr: 'TSUNADE', chakra: 4, power: 4 });
    state.activeMissions[0].player1Characters = [tsunadeM0];
    state.activeMissions[1].player1Characters = [tsunadeM1];
    const kankuro = mockCharInPlay({ controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 }, { id: 'KS-119-R', number: 119, name_fr: 'KANKURO', chakra: 5, power: 3 });
    state.activeMissions[0].player2Characters = [kankuro];

    const pending: PendingEffect = {
      id: 'pe-k119', sourceCardId: 'KS-119-R', sourceInstanceId: kankuro.instanceId, sourceMissionIndex: 0,
      effectType: 'UPGRADE' as EffectType, effectDescription: '', targetSelectionType: 'KANKURO119_MOVE_CHARACTER',
      sourcePlayer: 'player2', requiresTargetSelection: true, validTargets: [tsunadeM0.instanceId],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: true,
    };
    const newState = EffectEngine.applyTargetedEffect(state, pending, [tsunadeM0.instanceId]);
    expect(newState.activeMissions[0].player1Characters.some(c => c.instanceId === tsunadeM0.instanceId)).toBe(true);
    expect(newState.activeMissions[1].player1Characters.length).toBe(1);
  });

  it('Itachi 128-MV auto-move does not create a same-name duplicate', () => {
    const state = twoMissions(createActionPhaseState({}));
    const itachi = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, { id: 'KS-128-MV', number: 128, name_fr: 'ITACHI UCHIWA', chakra: 5, power: 5 });
    const tsunadeToMove = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, { id: 'KS-004-UC', number: 4, name_fr: 'TSUNADE', chakra: 4, power: 4 });
    const tsunadeExisting = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1 }, { id: 'KS-004-UC', number: 4, name_fr: 'TSUNADE', chakra: 4, power: 4 });
    state.activeMissions[0].player1Characters = [itachi, tsunadeToMove];
    state.activeMissions[1].player1Characters = [tsunadeExisting];

    const handler = getEffectHandler('KS-128-MV', 'MAIN');
    expect(handler).toBeTruthy();
    const ctx: EffectContext = {
      state, sourcePlayer: 'player1', sourceCard: itachi, sourceMissionIndex: 0,
      triggerType: 'MAIN' as EffectType, isUpgrade: true,
    };
    const result = handler!(ctx);
    const s = result.state;
    expect(s.activeMissions[1].player1Characters.length).toBe(1);
    expect(s.activeMissions[0].player1Characters.some(c => c.instanceId === tsunadeToMove.instanceId)).toBe(true);
  });
});
