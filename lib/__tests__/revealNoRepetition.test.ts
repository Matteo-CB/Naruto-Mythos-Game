import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { validateRevealCharacter } from '../engine/rules/PlayValidation';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

describe('Reveal No Repetition (2026-05-14, post-Marcello clarification): reveal = play, BLOCKED', () => {
  it('blocks reveal of own hidden when a same-name face-up (stolen-controlled) exists on player side', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const stolenFaceUp = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, isHidden: false, controllerInstanceId: 'inst-ino' },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 3 },
    );
    const ownHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 4 },
    );
    state.activeMissions[0].player1Characters = [stolenFaceUp, ownHidden];

    const result = validateRevealCharacter(state, 'player1', 0, ownHidden.instanceId);
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.duplicateNameReveal');
  });

  it('GameEngine.applyAction returns state unchanged when reveal is blocked by No Rep', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const chakraBefore = state.player1.chakra;
    const p1DiscardBefore = state.player1.discardPile.length;
    const p2DiscardBefore = state.player2.discardPile.length;

    const stolenFaceUp = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, isHidden: false, controllerInstanceId: 'inst-ino' },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 3 },
    );
    const ownHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 4 },
    );
    state.activeMissions[0].player1Characters = [stolenFaceUp, ownHidden];

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER',
      missionIndex: 0,
      characterInstanceId: ownHidden.instanceId,
    });

    expect(newState.player1.chakra).toBe(chakraBefore);
    expect(newState.player1.discardPile.length).toBe(p1DiscardBefore);
    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore);

    const stillHidden = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === ownHidden.instanceId);
    expect(stillHidden?.isHidden).toBe(true);

    const stolenStill = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === stolenFaceUp.instanceId);
    expect(stolenStill?.isHidden).toBe(false);
  });

  it('still blocks the classic scenario: own face-up Naruto + own hidden Naruto with lower chakra', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const ownHighFaceUp = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    const ownLowHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [ownHighFaceUp, ownLowHidden];

    const result = validateRevealCharacter(state, 'player1', 0, ownLowHidden.instanceId);
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.duplicateNameReveal');
  });

  it('allows normal upgrade reveal when target is owned (not controlled) and chakra is higher', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const ownLowFaceUp = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    const ownHighHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [ownLowFaceUp, ownHighHidden];

    const result = validateRevealCharacter(state, 'player1', 0, ownHighHidden.instanceId);
    expect(result.valid).toBe(true);
  });

  it('allows fresh reveal when no same-name face-up exists on side', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [hidden];

    const result = validateRevealCharacter(state, 'player1', 0, hidden.instanceId);
    expect(result.valid).toBe(true);

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER',
      missionIndex: 0,
      characterInstanceId: hidden.instanceId,
    });
    expect(newState.activeMissions[0].player1Characters[0].isHidden).toBe(false);
  });

  it('blocks flexible-upgrade reveal when the flexible target is controlled', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 20;
    const stolenSasuke = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, isHidden: false, controllerInstanceId: 'inst-ino' },
      { id: 'KS-014-R', name_fr: 'Sasuke Uchiwa', chakra: 3, keywords: ['Team 7'], number: 14 },
    );
    const ownHiddenFlexNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      {
        id: 'KS-051-UC',
        name_fr: 'Naruto Uzumaki',
        chakra: 5,
        keywords: ['Team 7'],
        number: 51,
        effects: [{ type: 'MAIN', description: '[⧗] Can be played as upgrade onto any Team 7 character.' }],
      },
    );
    state.activeMissions[0].player1Characters = [stolenSasuke, ownHiddenFlexNaruto];

    const result = validateRevealCharacter(state, 'player1', 0, ownHiddenFlexNaruto.instanceId);
    expect(result.valid).toBe(true);
  });
});
