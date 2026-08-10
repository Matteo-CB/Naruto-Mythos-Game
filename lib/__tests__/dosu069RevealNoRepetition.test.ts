import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { GameState, PendingEffect } from '../engine/types';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

function forceRevealOrDefeatPending(): PendingEffect {
  return {
    id: 'pending-dosu-069',
    sourceCardId: 'KS-069-UC',
    sourceInstanceId: 'inst-dosu',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: '',
    targetSelectionType: 'FORCE_REVEAL_OR_DEFEAT',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  };
}

function visibleNamed(state: GameState, name: string): number {
  return state.activeMissions[0].player2Characters.filter((c) => {
    if (c.isHidden) return false;
    const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return top.name_fr === name;
  }).length;
}

describe('Dosu Kinuta 069: the forced reveal obeys No Repetition', () => {
  it('never offers the reveal when a same-name visible character blocks it, and defeats instead', () => {
    const state = createActionPhaseState({});
    state.player2.chakra = 20;

    const visibleShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    const hiddenShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-021-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    state.activeMissions[0].player2Characters = [visibleShikamaru, hiddenShikamaru];

    const chakraBefore = state.player2.chakra;
    const newState = EffectEngine.applyTargetedEffect(state, forceRevealOrDefeatPending(), [hiddenShikamaru.instanceId]);

    expect(newState.player2.chakra).toBe(chakraBefore);
    expect(newState.pendingEffects.some((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE')).toBe(false);
    expect(newState.activeMissions[0].player2Characters.some((c) => c.instanceId === hiddenShikamaru.instanceId)).toBe(false);
    expect(visibleNamed(newState, 'Shikamaru')).toBe(1);
    expect(newState.log.some((l) => l.messageKey === 'game.log.effect.dosu069DuplicateNameDefeat')).toBe(true);
  });

  it('still offers the reveal when the hidden card can legally merge as an upgrade', () => {
    const state = createActionPhaseState({});
    state.player2.chakra = 20;

    const visibleShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-021-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    const hiddenShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    state.activeMissions[0].player2Characters = [visibleShikamaru, hiddenShikamaru];

    const newState = EffectEngine.applyTargetedEffect(state, forceRevealOrDefeatPending(), [hiddenShikamaru.instanceId]);

    const choice = newState.pendingEffects.find((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE');
    expect(choice).toBeDefined();
    expect(choice?.selectingPlayer).toBe('player2');
    expect(newState.player2.chakra).toBe(20);

    const merged = EffectEngine.applyTargetedEffect(newState, choice as PendingEffect, [hiddenShikamaru.instanceId]);
    expect(visibleNamed(merged, 'Shikamaru')).toBe(1);
    const survivor = merged.activeMissions[0].player2Characters.find((c) => c.instanceId === visibleShikamaru.instanceId);
    expect(survivor?.isHidden).toBe(false);
    expect(survivor?.card.id).toBe('KS-111-R');
    expect(merged.player2.chakra).toBeLessThan(20);
  });

  it('refuses to merge onto a controlled character and defeats the hidden card instead', () => {
    const state = createActionPhaseState({});
    state.player2.chakra = 20;

    const stolenShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player1', missionIndex: 0, isHidden: false, controllerInstanceId: 'inst-ino' },
      { id: 'KS-021-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    const hiddenShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    state.activeMissions[0].player2Characters = [stolenShikamaru, hiddenShikamaru];

    const chakraBefore = state.player2.chakra;
    const newState = EffectEngine.applyTargetedEffect(state, forceRevealOrDefeatPending(), [hiddenShikamaru.instanceId]);

    expect(newState.player2.chakra).toBe(chakraBefore);
    expect(newState.pendingEffects.some((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE')).toBe(false);
    expect(visibleNamed(newState, 'Shikamaru')).toBe(1);
  });

  it('still reveals normally when no same-name visible character is present', () => {
    const state = createActionPhaseState({});
    state.player2.chakra = 20;

    const hiddenShikamaru = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-021-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    state.activeMissions[0].player2Characters = [hiddenShikamaru];

    const newState = EffectEngine.applyTargetedEffect(state, forceRevealOrDefeatPending(), [hiddenShikamaru.instanceId]);
    const choice = newState.pendingEffects.find((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE');
    expect(choice).toBeDefined();

    const revealed = EffectEngine.applyTargetedEffect(newState, choice as PendingEffect, [hiddenShikamaru.instanceId]);
    const target = revealed.activeMissions[0].player2Characters.find((c) => c.instanceId === hiddenShikamaru.instanceId);
    expect(target?.isHidden).toBe(false);
    expect(revealed.player2.chakra).toBe(20 - (3 + 2));
  });
});
