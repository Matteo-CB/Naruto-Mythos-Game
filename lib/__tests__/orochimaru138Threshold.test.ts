import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const OROCHIMARU = 'KS-138-S';
const KABUTO_4 = 'KS-053-UC';
const NEW_FORCES = 'SS-001-MMS';
const PLAIN_MISSION = 'KS-001-MMS';

function boardWithTarget(missionId: string, tokens: number): GameState {
  const state = buildSimState({
    missionIds: [missionId, 'KS-006-MMS'],
    hand1: [OROCHIMARU],
    p1: [simChar(KABUTO_4, { owner: 'player1', instanceId: 'my-kabuto', powerTokens: tokens })],
    chakra1: 30,
  });
  return state;
}

function upgradeOntoKabuto(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'my-kabuto',
  });
}

function confirmPrompt(state: GameState) {
  return state.pendingActions.find((a) => a.descriptionKey === 'game.effect.desc.orochimaru138ConfirmUpgrade');
}

function acceptBonusIfOffered(state: GameState): GameState {
  const offered = confirmPrompt(state);
  if (!offered) return state;
  return GameEngine.applyAction(state, offered.player, {
    type: 'SELECT_TARGET', pendingActionId: offered.id, selectedTargets: [offered.options[0]],
  });
}

function pointsGained(before: GameState, after: GameState): number {
  return acceptBonusIfOffered(after).player1.missionPoints - before.player1.missionPoints;
}

describe('Orochimaru 138 reads the power the character had before the upgrade', () => {
  it('the reported case: Kabuto at 4 on New Forces gives no bonus points', () => {
    const before = boardWithTarget(NEW_FORCES, 0);
    const after = upgradeOntoKabuto(before);

    const stack = after.activeMissions[0].player1Characters.find((c) => c.instanceId === 'my-kabuto');
    expect(stack, 'the upgrade happened').toBeTruthy();
    expect(stack!.powerTokens, 'the mission still hands its two tokens to the new play').toBe(2);
    expect(confirmPrompt(after), 'no window may even open').toBeFalsy();
    expect(pointsGained(before, after), 'but Kabuto was a 4, so no bonus points').toBe(0);
  });

  it('the same board without the mission also gives nothing', () => {
    const before = boardWithTarget(PLAIN_MISSION, 0);
    const after = upgradeOntoKabuto(before);
    expect(pointsGained(before, after)).toBe(0);
  });

  it('tokens the character already carried do count, so a real 6 pays', () => {
    const before = boardWithTarget(PLAIN_MISSION, 2);
    const after = upgradeOntoKabuto(before);
    expect(pointsGained(before, after), 'four printed plus two tokens it already had').toBe(2);
  });

  it('on New Forces a real 6 still pays exactly once', () => {
    const before = boardWithTarget(NEW_FORCES, 2);
    const after = upgradeOntoKabuto(before);
    expect(pointsGained(before, after)).toBe(2);
  });

  it('a character one point short stays short, mission bonus or not', () => {
    const plain = boardWithTarget(PLAIN_MISSION, 1);
    const newForces = boardWithTarget(NEW_FORCES, 1);

    expect(pointsGained(plain, upgradeOntoKabuto(plain)), 'five is not six').toBe(0);
    expect(pointsGained(newForces, upgradeOntoKabuto(newForces)), 'and the mission must not push it over').toBe(0);
  });
});
