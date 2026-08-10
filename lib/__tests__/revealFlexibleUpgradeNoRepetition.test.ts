import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

const flexibleEffects = [
  { type: 'MAIN' as const, description: '[⧗] This card can upgrade over any character.' },
];

describe('reveal as flexible upgrade must respect No Repetition', () => {
  it('refuses to reveal onto another name while a visible same-name character is on that side', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;

    const visibleTwin = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-051-UC', set: 'KS', number: 51, name_fr: 'OROCHIMARU', chakra: 7, effects: flexibleEffects },
    );
    const flexTarget = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-053-UC', set: 'KS', number: 53, name_fr: 'KABUTO YAKUSHI', chakra: 2 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-138-S', set: 'KS', number: 138, name_fr: 'OROCHIMARU', chakra: 6, effects: flexibleEffects },
    );
    state.activeMissions[0].player1Characters = [visibleTwin, flexTarget, hidden];

    const before = state.player1.chakra;
    const after = GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER',
      missionIndex: 0,
      characterInstanceId: hidden.instanceId,
      upgradeTargetInstanceId: flexTarget.instanceId,
    });

    const side = after.activeMissions[0].player1Characters;
    const visibleOrochimaru = side.filter((c) => {
      if (c.isHidden) return false;
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr.toUpperCase() === 'OROCHIMARU';
    });

    expect(visibleOrochimaru.length).toBe(1);
    expect(after.player1.chakra).toBe(before);
    const stillHidden = side.find((c) => c.instanceId === hidden.instanceId);
    expect(stillHidden?.isHidden).toBe(true);
  });

  it('still allows a flexible upgrade reveal when no same-name character is visible', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;

    const flexTarget = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-053-UC', set: 'KS', number: 53, name_fr: 'KABUTO YAKUSHI', chakra: 2 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-138-S', set: 'KS', number: 138, name_fr: 'OROCHIMARU', chakra: 6, effects: flexibleEffects },
    );
    state.activeMissions[0].player1Characters = [flexTarget, hidden];

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER',
      missionIndex: 0,
      characterInstanceId: hidden.instanceId,
      upgradeTargetInstanceId: flexTarget.instanceId,
    });

    const side = after.activeMissions[0].player1Characters;
    expect(side.length).toBe(1);
    const top = side[0].stack[side[0].stack.length - 1];
    expect(top.name_fr.toUpperCase()).toBe('OROCHIMARU');
    expect(side[0].isHidden).toBe(false);
  });
});
