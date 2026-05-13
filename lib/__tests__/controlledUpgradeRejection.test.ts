import { describe, it, expect } from 'vitest';
import { validateUpgradeCharacter } from '../engine/rules/PlayValidation';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

describe('Controlled-character upgrade rejection (2026-05-14 rule)', () => {
  it('rejects upgrade when target is controlled by player but originally owned by opponent', () => {
    const state = createActionPhaseState({});
    const stolenChar = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        missionIndex: 0,
        controllerInstanceId: 'some-controller-id',
      },
      { name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [stolenChar];

    const upgrade = mockCharacter({ name_fr: 'Naruto', chakra: 5 });
    const result = validateUpgradeCharacter(state, 'player1', upgrade, 0, stolenChar.instanceId);

    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.cannotUpgradeControlled');
  });

  it('allows upgrade when target is owned AND controlled by the same player (normal case)', () => {
    const state = createActionPhaseState({});
    const ownChar = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player1',
        missionIndex: 0,
      },
      { name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [ownChar];

    const upgrade = mockCharacter({ name_fr: 'Naruto', chakra: 5 });
    const result = validateUpgradeCharacter(state, 'player1', upgrade, 0, ownChar.instanceId);

    expect(result.valid).toBe(true);
  });

  it('blocks the upgrade even when the player has the chakra and the chakra cost is otherwise correct', () => {
    const state = createActionPhaseState({});
    const stolenChar = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        missionIndex: 0,
      },
      { name_fr: 'Naruto', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [stolenChar];
    state.player1.chakra = 99;

    const upgrade = mockCharacter({ name_fr: 'Naruto', chakra: 3 });
    const result = validateUpgradeCharacter(state, 'player1', upgrade, 0, stolenChar.instanceId);

    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.cannotUpgradeControlled');
  });

  it('rejects controlled-character upgrade for player2 too (rule applies to both sides)', () => {
    const state = createActionPhaseState({});
    const stolenChar = mockCharInPlay(
      {
        controlledBy: 'player2',
        originalOwner: 'player1',
        missionIndex: 0,
      },
      { name_fr: 'Sasuke', chakra: 3 },
    );
    state.activeMissions[0].player2Characters = [stolenChar];

    const upgrade = mockCharacter({ name_fr: 'Sasuke', chakra: 5 });
    const result = validateUpgradeCharacter(state, 'player2', upgrade, 0, stolenChar.instanceId);

    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.cannotUpgradeControlled');
  });
});
