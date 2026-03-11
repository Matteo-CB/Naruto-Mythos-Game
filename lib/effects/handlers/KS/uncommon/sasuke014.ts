import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at the opponent's hand. (Mandatory)
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card.
 *   If you do so, choose 1 card in the opponent's hand and discard it.
 *   (The UPGRADE includes the AMBUSH effect - shows opponent's hand first,
 *    then offers the discard chain.)
 */

function handleSasuke014Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (014): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    );
    return { state: { ...state, log } };
  }

  // Confirmation popup before revealing hand
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, isUpgrade }),
    descriptionKey: 'game.effect.desc.sasuke014ConfirmAmbush',
  };
}

function handleSasuke014Upgrade(ctx: EffectContext): EffectResult {
  // UPGRADE modifies AMBUSH - the AMBUSH handler checks ctx.isUpgrade
  // and chains the discard flow when true. No separate UPGRADE action needed.
  return { state: ctx.state };
}

export function registerSasuke014Handlers(): void {
  registerEffect('KS-014-UC', 'AMBUSH', handleSasuke014Ambush);
  registerEffect('KS-014-UC', 'UPGRADE', handleSasuke014Upgrade);
}
