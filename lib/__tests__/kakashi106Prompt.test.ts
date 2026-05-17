import { describe, it, expect } from 'vitest';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';
import { getEffectHandler } from '../effects/EffectRegistry';
import type { EffectContext } from '../effects/EffectTypes';

function runEffect(cardId: string, type: 'MAIN', ctx: EffectContext) {
  const h = getEffectHandler(cardId, type);
  if (!h) throw new Error('handler not found');
  return h(ctx);
}

describe('Kakashi 106 (Rare) MAIN — prompt detection', () => {
  it('prompts CONFIRM_MAIN when an upgraded Gaara KS-120-R is on the enemy side', () => {
    const state = createActionPhaseState({});

    const baseGaara = mockCharacter({ id: 'KS-073-C', number: 73, name_fr: 'GAARA', chakra: 3 });
    const gaaraTop = mockCharacter({ id: 'KS-120-R', number: 120, name_fr: 'GAARA', chakra: 4, title_fr: 'Sand Coffin' });
    const upgradedGaara = mockCharInPlay(
      {
        controlledBy: 'player2',
        originalOwner: 'player2',
        missionIndex: 0,
        isHidden: false,
        stack: [baseGaara, gaaraTop],
      },
      gaaraTop,
    );
    state.activeMissions[0].player2Characters = [upgradedGaara];

    const kakashi106 = mockCharacter({
      id: 'KS-106-R',
      number: 106,
      name_fr: 'KAKASHI HATAKE',
      chakra: 5,
      effects: [
        { type: 'MAIN', description: 'Discard the top card of an upgraded enemy character in play.' },
      ],
    });
    const kakashiInPlay = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      kakashi106,
    );
    state.activeMissions[0].player1Characters = [kakashiInPlay];

    const ctx: EffectContext = {
      state,
      sourcePlayer: 'player1',
      sourceCard: kakashiInPlay,
      sourceMissionIndex: 0,
      triggerType: 'MAIN',
      isUpgrade: false,
    };

    const result = runEffect('KS-106-R', 'MAIN', ctx);

    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KAKASHI106_CONFIRM_MAIN');
    expect(result.isOptional).toBe(true);
  });

  it('does NOT prompt when no enemy character is upgraded (stack length 1)', () => {
    const state = createActionPhaseState({});

    const plainGaara = mockCharacter({ id: 'KS-120-R', number: 120, name_fr: 'GAARA', chakra: 4 });
    const flatGaara = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, stack: [plainGaara] },
      plainGaara,
    );
    state.activeMissions[0].player2Characters = [flatGaara];

    const kakashi106 = mockCharacter({
      id: 'KS-106-R', number: 106, name_fr: 'KAKASHI HATAKE', chakra: 5,
      effects: [{ type: 'MAIN', description: 'Discard the top card of an upgraded enemy character in play.' }],
    });
    const kakashiInPlay = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      kakashi106,
    );
    state.activeMissions[0].player1Characters = [kakashiInPlay];

    const ctx: EffectContext = {
      state, sourcePlayer: 'player1', sourceCard: kakashiInPlay,
      sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false,
    };
    const result = runEffect('KS-106-R', 'MAIN', ctx);
    expect(result.requiresTargetSelection).toBeFalsy();
  });

});
