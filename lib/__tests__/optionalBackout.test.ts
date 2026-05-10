/**
 * Verifies the engine-level rule:
 *   When you dispatch an OPTIONAL pendingEffect and the case body did NOT mutate
 *   permanent state (no card drawn, no chakra paid, no character defeated, etc.),
 *   any new pendingEffect pushed by that case has its isMandatory flag relaxed
 *   to false and rootOptional set to true. The player can therefore still back
 *   out at the next target prompt.
 *
 *   When the case body DID mutate permanent state (Sakura 012 drawing a card,
 *   for example), the isMandatory flag stays in force and the player cannot
 *   skip the consequence.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '../effects/EffectRegistry';
import { EffectEngine } from '../effects/EffectEngine';
import { createActionPhaseState, mockCharInPlay, mockCharacter, mockMission } from './testHelpers';
import type { GameState, PendingEffect, CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});


function dispatch(state: GameState, pe: PendingEffect, target = pe.validTargets?.[0] ?? 'skip'): GameState {

  state.pendingEffects.push(pe);
  return EffectEngine.applyTargetedEffect(state, pe, [target]);
}


function pickNewPendingEffect(before: GameState, after: GameState): PendingEffect | undefined {
  const beforeIds = new Set(before.pendingEffects.map((p) => p.id));
  return after.pendingEffects.find((p) => !beforeIds.has(p.id));
}


describe('optional effect back-out propagation', () => {
  it('Temari 121 MAIN: after confirming the optional effect, the target-pick follow-up is skippable', () => {

    const temari = mockCharInPlay(
      { instanceId: 'temari-1' },
      { id: 'KS-121-R', number: 121, name_fr: 'TEMARI', power: 4, chakra: 4 },
    );
    const otherChar = mockCharInPlay(
      { instanceId: 'ally-1' },
      { id: 'KS-070-C', number: 70, name_fr: 'GAARA', power: 2, chakra: 2 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        {
          card: mockMission({ basePoints: 3 }), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
          player1Characters: [temari, otherChar],
          player2Characters: [],
        },
        {
          card: mockMission({ basePoints: 4 }), rank: 'C', basePoints: 4, rankBonus: 2, wonBy: null,
          player1Characters: [],
          player2Characters: [],
        },
      ],
    });

    const confirmEffect: PendingEffect = {
      id: 'pe-confirm',
      sourceCardId: 'KS-121-R',
      sourceInstanceId: 'temari-1',
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: '',
      targetSelectionType: 'TEMARI121_CONFIRM_MAIN',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: ['temari-1'],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    };

    const before = { ...state };
    const after = dispatch(state, confirmEffect, 'temari-1');
    const followUp = pickNewPendingEffect(before, after);

    expect(followUp).toBeDefined();
    expect(followUp!.targetSelectionType).toBe('TEMARI121_MOVE_FRIENDLY');

    expect(followUp!.isMandatory).toBe(false);
    expect(followUp!.rootOptional).toBe(true);
  });

  it('Sakura 012 UPGRADE: after the confirm (which draws a card), the mandatory discard CANNOT be skipped', () => {

    const sakura = mockCharInPlay(
      { instanceId: 'sak-1' },
      { id: 'KS-012-UC', number: 12, name_fr: 'SAKURA HARUNO', power: 2, chakra: 3 },
    );
    const handCard = mockCharacter({ id: 'KS-040-C', name_fr: 'KAKASHI', chakra: 5, power: 5 });
    const deckCard = mockCharacter({ id: 'KS-050-C', name_fr: 'IRUKA', chakra: 1, power: 1 });

    const baseState = createActionPhaseState({
      activeMissions: [
        {
          card: mockMission({ basePoints: 3 }), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
          player1Characters: [sakura],
          player2Characters: [],
        },
      ],
    });

    const state: GameState = {
      ...baseState,
      player1: {
        ...baseState.player1,
        hand: [handCard],
        deck: [deckCard, ...baseState.player1.deck.slice(1)],
      },
    };

    const confirmEffect: PendingEffect = {
      id: 'pe-sakura',
      sourceCardId: 'KS-012-UC',
      sourceInstanceId: 'sak-1',
      sourceMissionIndex: 0,
      effectType: 'UPGRADE',
      effectDescription: '',
      targetSelectionType: 'SAKURA012_CONFIRM_UPGRADE',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: ['sak-1'],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: true,
    };

    const before = { ...state };
    const after = dispatch(state, confirmEffect, 'sak-1');


    expect(after.player1.hand.length).toBe(2);
    expect(after.player1.deck.length).toBe(state.player1.deck.length - 1);

    const followUp = pickNewPendingEffect(before, after);
    expect(followUp).toBeDefined();
    expect(followUp!.targetSelectionType).toBe('SAKURA_012_DISCARD');

    expect(followUp!.isMandatory).toBe(true);
    expect(followUp!.rootOptional).not.toBe(true);
  });
});
