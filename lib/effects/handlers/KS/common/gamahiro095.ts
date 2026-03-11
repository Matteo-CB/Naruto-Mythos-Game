import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 095/130 - GAMAHIRO (Common)
 * Chakra: 4 | Power: 6
 * Group: Independent | Keywords: Summon
 * MAIN (1): If there's a friendly character in this mission, draw a card.
 * MAIN (2) [continuous]: At the end of the round, you must return this character to your hand.
 *
 * Confirmation popup before drawing (MAIN effects are optional).
 */
function handleGamahiro095Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Pre-check: any friendly character in this mission (not self)?
  const hasFriendly = friendlyChars.some(
    (char) => char.instanceId !== sourceCard.instanceId,
  );

  if (!hasFriendly) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gamahiro (095): No other friendly character in this mission.',
      'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' }) } };
  }

  // Pre-check: deck not empty?
  if (state[sourcePlayer].deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gamahiro (095): Deck is empty, cannot draw.',
      'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAMAHIRO095_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Gamahiro (095) MAIN: Draw 1 card (friendly character present).',
    descriptionKey: 'game.effect.desc.gamahiro095ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-095-C', 'MAIN', handleGamahiro095Main);
}
