import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';
import type { CharacterInPlay, CharacterCard } from '../../../engine/types';

/**
 * Card 125/130 - TAYUYA (R)
 * Chakra: 3, Power: 2
 * Group: Sound Village, Keywords: Sound Four
 *
 * MAIN [continuous]: Non-hidden enemies cost 1 extra Chakra to play in this mission.
 *   This is a continuous cost modifier handled by the engine's chakra validation.
 *   The handler here is a no-op.
 *
 * UPGRADE: Play a Sound Village character from hand, paying 2 less.
 *   When isUpgrade: find Sound Village characters in hand that the player can afford
 *   (cost - 2). Target selection for which to play, then which mission.
 */

function tayuya125MainHandler(ctx: EffectContext): EffectResult {
  // Continuous cost modifier - handled by the engine's chakra validation.
  // Non-hidden enemies cost 1 extra to play in this mission.
  return { state: ctx.state };
}

function tayuya125UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find Sound Village characters in hand that the player can afford (cost - 2)
  const affordableIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.group === 'Sound Village') {
      const cost = Math.max(0, card.chakra - 2);
      if (playerState.chakra >= cost) {
        affordableIndices.push(String(i));
      }
    }
  }

  if (affordableIndices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Tayuya (125) UPGRADE: No affordable Sound Village character in hand (cost reduced by 2).',
          'game.log.effect.noTarget',
          { card: 'TAYUYA', id: '125/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAYUYA125_CHOOSE_SOUND',
    validTargets: affordableIndices,
    description: 'Tayuya (125) UPGRADE: Choose a Sound Village character from your hand to play (paying 2 less).',
  };
}

export function registerTayuya125Handlers(): void {
  registerEffect('125/130', 'MAIN', tayuya125MainHandler);
  registerEffect('125/130', 'UPGRADE', tayuya125UpgradeHandler);
}
