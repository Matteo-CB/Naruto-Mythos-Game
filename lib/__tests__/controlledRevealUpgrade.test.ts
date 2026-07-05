import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { validateRevealCharacter } from '@/lib/engine/rules/PlayValidation';
import { generateInstanceId } from '@/lib/engine/utils/id';
import type { GameState } from '@/lib/engine/types';

function setupBoard(): { state: GameState; controlledHiddenId: string; ownFaceUpId: string } {
  const mission = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
  const state = createActionPhaseState({ activeMissions: [mission] });

  state.player2.chakra = 20;

  const controlledHiddenId = generateInstanceId();
  const controlledHidden = mockCharInPlay({
    instanceId: controlledHiddenId,
    isHidden: true,
    wasRevealedAtLeastOnce: false,
    controlledBy: 'player2',
    originalOwner: 'player1',
    missionIndex: 0,
  }, {
    id: 'KS-135-S',
    number: 135,
    name_fr: 'SAKURA HARUNO',
    chakra: 5,
    power: 4,
    group: 'Leaf Village',
  });
  state.activeMissions[0].player2Characters.push(controlledHidden);

  const ownFaceUpId = generateInstanceId();
  const ownFaceUp = mockCharInPlay({
    instanceId: ownFaceUpId,
    isHidden: false,
    wasRevealedAtLeastOnce: true,
    controlledBy: 'player2',
    originalOwner: 'player2',
    missionIndex: 0,
  }, {
    id: 'KS-011-C',
    number: 11,
    name_fr: 'SAKURA HARUNO',
    chakra: 2,
    power: 2,
    group: 'Leaf Village',
  });
  state.activeMissions[0].player2Characters.push(ownFaceUp);

  return { state, controlledHiddenId, ownFaceUpId };
}

describe('Reveal of a controlled hidden character into own same-name face-up', () => {
  it('blocks reveal when a same-name own face-up exists on the same side', () => {
    const { state, controlledHiddenId } = setupBoard();
    const result = validateRevealCharacter(state, 'player2', 0, controlledHiddenId);
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.duplicateNameReveal');
  });

  it('blocks reveal even when the player tries to pass the own char as explicit upgrade target', () => {
    const { state, controlledHiddenId, ownFaceUpId } = setupBoard();
    const result = validateRevealCharacter(state, 'player2', 0, controlledHiddenId, ownFaceUpId);
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.duplicateNameReveal');
  });

  it('still allows reveal of own hidden when no controlled-card duplication is involved', () => {
    const mission = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
    const state = createActionPhaseState({ activeMissions: [mission] });
    state.player2.chakra = 20;

    const ownHiddenId = generateInstanceId();
    const ownHidden = mockCharInPlay({
      instanceId: ownHiddenId,
      isHidden: true,
      wasRevealedAtLeastOnce: false,
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-135-S',
      number: 135,
      name_fr: 'SAKURA HARUNO',
      chakra: 5,
      power: 4,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(ownHidden);

    const ownFaceUp = mockCharInPlay({
      instanceId: generateInstanceId(),
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-011-C',
      number: 11,
      name_fr: 'SAKURA HARUNO',
      chakra: 2,
      power: 2,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(ownFaceUp);

    const result = validateRevealCharacter(state, 'player2', 0, ownHiddenId);
    expect(result.valid).toBe(true);
  });

  it('blocks a controlled hidden card from flexibly upgrading over a different-name character', () => {
    const mission = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
    const state = createActionPhaseState({ activeMissions: [mission] });
    state.player2.chakra = 20;

    const controlledHiddenId = generateInstanceId();
    const controlledHidden = mockCharInPlay({
      instanceId: controlledHiddenId,
      isHidden: true,
      wasRevealedAtLeastOnce: false,
      controlledBy: 'player2',
      originalOwner: 'player1',
      missionIndex: 0,
    }, {
      id: 'KS-138-S',
      number: 138,
      name_fr: 'OROCHIMARU',
      chakra: 6,
      power: 5,
      group: 'Sound Village',
      effects: [{ type: 'MAIN', description: '[⧗] This card can upgrade over any character.' }],
    });
    state.activeMissions[0].player2Characters.push(controlledHidden);

    const ownFaceUp = mockCharInPlay({
      instanceId: generateInstanceId(),
      isHidden: false,
      wasRevealedAtLeastOnce: true,
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-014-R',
      number: 14,
      name_fr: 'SASUKE UCHIWA',
      chakra: 3,
      power: 4,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(ownFaceUp);

    const result = validateRevealCharacter(state, 'player2', 0, controlledHiddenId);
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.cannotUpgradeWithControlled');
  });

  it('allows an owned hidden card to flexibly upgrade over a different-name character', () => {
    const mission = { card: mockMission({ id: 'm1' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null };
    const state = createActionPhaseState({ activeMissions: [mission] });
    state.player2.chakra = 20;

    const ownHiddenId = generateInstanceId();
    const ownHidden = mockCharInPlay({
      instanceId: ownHiddenId,
      isHidden: true,
      wasRevealedAtLeastOnce: false,
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-138-S',
      number: 138,
      name_fr: 'OROCHIMARU',
      chakra: 6,
      power: 5,
      group: 'Sound Village',
      effects: [{ type: 'MAIN', description: '[⧗] This card can upgrade over any character.' }],
    });
    state.activeMissions[0].player2Characters.push(ownHidden);

    const ownFaceUp = mockCharInPlay({
      instanceId: generateInstanceId(),
      isHidden: false,
      wasRevealedAtLeastOnce: true,
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
    }, {
      id: 'KS-014-R',
      number: 14,
      name_fr: 'SASUKE UCHIWA',
      chakra: 3,
      power: 4,
      group: 'Leaf Village',
    });
    state.activeMissions[0].player2Characters.push(ownFaceUp);

    const result = validateRevealCharacter(state, 'player2', 0, ownHiddenId);
    expect(result.valid).toBe(true);
  });
});
