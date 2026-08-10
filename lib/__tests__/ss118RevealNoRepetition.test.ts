import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { CharacterInPlay, GameState, PendingEffect } from '../engine/types';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

const GENMA_EFFECT =
  '[⧗] If a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you can defeat this character instead.';

function revealDefeatPending(sourceInstanceId: string): PendingEffect {
  return {
    id: 'pending-ss-118',
    sourceCardId: 'SS-118-CHIBIV',
    sourceInstanceId,
    sourceMissionIndex: 0,
    effectType: 'AMBUSH',
    effectDescription: '',
    targetSelectionType: 'SS118_REVEAL_DEFEAT',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
}

function shikamaruInPlay(): CharacterInPlay {
  return mockCharInPlay(
    { instanceId: 'inst-shikamaru', controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 },
    { id: 'SS-118-CHIBIV', set: 'SS', number: 118, name_fr: 'Shikamaru Nara', chakra: 5 },
  );
}

function visibleNamed(state: GameState, name: string): number {
  return state.activeMissions[0].player2Characters.filter((c) => {
    if (c.isHidden) return false;
    const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return top.name_fr === name;
  }).length;
}

function found(state: GameState, instanceId: string): CharacterInPlay | undefined {
  return state.activeMissions[0].player2Characters.find((c) => c.instanceId === instanceId);
}

describe('Shikamaru SS-118: the forced reveal obeys No Repetition', () => {
  it('leaves the hidden card face down when a same-name enemy is already visible, and still defeats it', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const visibleNaruto = mockCharInPlay(
      { instanceId: 'twin', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    const hiddenNaruto = mockCharInPlay(
      { instanceId: 'ghost', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [visibleNaruto, hiddenNaruto];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['ghost']);

    expect(found(newState, 'ghost'), 'the hidden card was defeated').toBeUndefined();
    expect(visibleNamed(newState, 'Naruto Uzumaki')).toBe(1);
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.duplicateNameReveal')).toBe(true);
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.ss118Reveal')).toBe(false);
  });

  it('never leaves two visible namesakes when the defeat is replaced by a protection', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const genma = mockCharInPlay(
      { instanceId: 'genma', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      {
        id: 'KS-049-C', set: 'KS', number: 49, name_fr: 'Genma Shiranui', chakra: 3,
        group: 'Leaf Village', effects: [{ type: 'MAIN', description: GENMA_EFFECT }],
      },
    );
    const visibleNaruto = mockCharInPlay(
      { instanceId: 'twin', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2, group: 'Leaf Village' },
    );
    const hiddenNaruto = mockCharInPlay(
      { instanceId: 'ghost', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2, group: 'Leaf Village' },
    );
    state.activeMissions[0].player2Characters = [genma, visibleNaruto, hiddenNaruto];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['ghost']);

    expect(visibleNamed(newState, 'Naruto Uzumaki')).toBe(1);
    expect(found(newState, 'ghost'), 'a face down card gets no protection').toBeUndefined();
    expect(newState.pendingActions.length, 'no protection choice was opened').toBe(0);
  });

  it('refuses the free upgrade merge and defeats the hidden card instead', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const visibleNaruto = mockCharInPlay(
      { instanceId: 'twin', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    const strongerHidden = mockCharInPlay(
      { instanceId: 'ghost', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true },
      { id: 'KS-010-C', set: 'KS', number: 10, name_fr: 'Naruto Uzumaki', chakra: 5 },
    );
    state.activeMissions[0].player2Characters = [visibleNaruto, strongerHidden];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['ghost']);

    expect(found(newState, 'ghost')).toBeUndefined();
    expect(visibleNamed(newState, 'Naruto Uzumaki')).toBe(1);
    expect(found(newState, 'twin')?.stack.length, 'the visible namesake was not upgraded').toBe(1);
  });

  it('reveals then defeats normally when no namesake is visible', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const hiddenNaruto = mockCharInPlay(
      { instanceId: 'ghost', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [hiddenNaruto];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['ghost']);

    expect(found(newState, 'ghost')).toBeUndefined();
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.ss118Reveal')).toBe(true);
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.duplicateNameReveal')).toBe(false);
  });

  it('does nothing when the designated character is already face up', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const faceUpNaruto = mockCharInPlay(
      { instanceId: 'faceup', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [faceUpNaruto];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['faceup']);

    expect(found(newState, 'faceup'), 'a face up character is not a legal target').toBeDefined();
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.duplicateNameReveal')).toBe(false);
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.defeat')).toBe(false);
  });

  it('remembers the name for the DUEL even when the reveal was refused', () => {
    const state = createActionPhaseState({});
    state.activeMissions[0].player1Characters = [shikamaruInPlay()];

    const visibleNaruto = mockCharInPlay(
      { instanceId: 'twin', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    const hiddenNaruto = mockCharInPlay(
      { instanceId: 'ghost', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true },
      { id: 'KS-009-C', set: 'KS', number: 9, name_fr: 'Naruto Uzumaki', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [visibleNaruto, hiddenNaruto];

    const newState = EffectEngine.applyTargetedEffect(state, revealDefeatPending('inst-shikamaru'), ['ghost']);

    const source = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === 'inst-shikamaru');
    expect(source?.ss118RevealedName).toBe('Naruto Uzumaki');
  });
});
