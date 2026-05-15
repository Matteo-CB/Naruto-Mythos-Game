import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import { GameEngine } from '../engine/GameEngine';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

const TSUNADE_003_EFFECT = { type: 'MAIN' as const, description: '[⧗] When a friendly character is defeated, gain 2 chakra.' };
const GEMMA_049_EFFECT = { type: 'MAIN' as const, description: '[⧗] If a friendly Leaf Village character would be defeated by an enemy effect, you may defeat this character instead.' };

describe('Gemma 049 sacrifice declined: original defeat must still fire defeat triggers', () => {
  it('Tsunade 003 (second copy) gains 2 chakra when first Tsunade dies after Gemma sacrifice declined', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 0;

    const tsunade1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-003-C', name_fr: 'Tsunade', chakra: 4, power: 3, number: 3, effects: [TSUNADE_003_EFFECT] },
    );
    const tsunade2 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-003-C', name_fr: 'Tsunade', chakra: 4, power: 3, number: 3, effects: [TSUNADE_003_EFFECT] },
    );
    const gemma = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-049-C', name_fr: 'Gemma Shiranui', chakra: 3, power: 2, number: 49, effects: [GEMMA_049_EFFECT] },
    );
    state.activeMissions[0].player1Characters = [tsunade1, tsunade2, gemma];

    const stateWithChoice = EffectEngine.defeatCharacter(state, tsunade1.instanceId, 'player2');

    expect(stateWithChoice.player1.chakra).toBe(0);
    const gemmaPending = stateWithChoice.pendingEffects.find((e) => e.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE');
    expect(gemmaPending).toBeDefined();

    expect(stateWithChoice.activeMissions[0].player1Characters.find((c) => c.instanceId === tsunade1.instanceId)).toBeDefined();

    const stateAfterDecline = GameEngine.applyAction(stateWithChoice, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: gemmaPending!.id,
    });

    expect(stateAfterDecline.activeMissions[0].player1Characters.find((c) => c.instanceId === tsunade1.instanceId)).toBeUndefined();

    expect(stateAfterDecline.player1.discardPile.some((c) => c.id === 'KS-003-C')).toBe(true);

    expect(stateAfterDecline.player1.chakra).toBe(2);

    const onDefeatLogs = stateAfterDecline.log.filter((l) => l.messageKey === 'game.log.effect.onDefeatChakra');
    expect(onDefeatLogs.length).toBe(1);
  });

  it('Sasuke 136 (any-defeat trigger) gains 1 chakra when a char dies after Gemma sacrifice declined', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 0;

    const sasuke136 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      {
        id: 'KS-136-S',
        name_fr: 'Sasuke Uchiwa',
        chakra: 6,
        power: 6,
        number: 136,
        effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 chakra.' }],
      },
    );
    const akamaru = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-027-C', name_fr: 'Akamaru', chakra: 1, power: 1, number: 27 },
    );
    const gemma = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-049-C', name_fr: 'Gemma Shiranui', chakra: 3, power: 2, number: 49, effects: [GEMMA_049_EFFECT] },
    );
    state.activeMissions[0].player1Characters = [sasuke136, akamaru, gemma];

    const stateWithChoice = EffectEngine.defeatCharacter(state, akamaru.instanceId, 'player2');
    const gemmaPending = stateWithChoice.pendingEffects.find((e) => e.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE');
    expect(gemmaPending).toBeDefined();

    const stateAfterDecline = GameEngine.applyAction(stateWithChoice, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: gemmaPending!.id,
    });

    expect(stateAfterDecline.player1.chakra).toBe(1);
  });

  it('No spurious trigger: declining without a real defeat target does nothing', () => {
    const state = createActionPhaseState({});
    state.player1.chakra = 5;
    const initialChakra = state.player1.chakra;
    const tsunade = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-003-C', name_fr: 'Tsunade', chakra: 4, power: 3, number: 3, effects: [TSUNADE_003_EFFECT] },
    );
    state.activeMissions[0].player1Characters = [tsunade];

    const phantomPending = {
      id: 'phantom-gemma',
      sourceCardId: 'KS-049-C',
      sourceInstanceId: 'inst-fake',
      sourceMissionIndex: 0,
      effectType: 'MAIN' as const,
      effectDescription: JSON.stringify({ targetInstanceId: '', sacrificeInstanceId: '', effectSource: 'player2' }),
      targetSelectionType: 'GEMMA049_SACRIFICE_CHOICE',
      sourcePlayer: 'player1' as const,
      requiresTargetSelection: true,
      validTargets: [],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    };
    state.pendingEffects = [phantomPending];

    const stateAfterDecline = GameEngine.applyAction(state, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: phantomPending.id,
    });

    expect(stateAfterDecline.player1.chakra).toBe(initialChakra);
  });
});
