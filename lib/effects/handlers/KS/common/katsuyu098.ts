import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 098/130 - KATSUYU (Common)
 * Chakra: 3 | Power: 5
 * Group: Independent | Keywords: Summon
 * MAIN (1): If there is a friendly Tsunade in play, POWERUP 2.
 * MAIN (2) [continuous]: At the end of the round, you must return this character to your hand.
 *
 * Confirmation popup before POWERUP (MAIN effects are optional).
 */
function handleKatsuyu098Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: friendly Tsunade anywhere in play?
  let hasTsunade = false;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceCard.instanceId) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.name_fr === 'TSUNADE') {
        hasTsunade = true;
        break;
      }
    }
    if (hasTsunade) break;
  }

  if (!hasTsunade) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Katsuyu (098): No friendly Tsunade in play.',
      'game.log.effect.noTarget', { card: 'KATSUYU', id: 'KS-098-C' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KATSUYU098_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Katsuyu (098) MAIN: POWERUP 2 (friendly Tsunade in play).',
    descriptionKey: 'game.effect.desc.katsuyu098ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-098-C', 'MAIN', handleKatsuyu098Main);
}
