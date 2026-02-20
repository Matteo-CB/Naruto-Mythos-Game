import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at the opponent's hand.
 *   - The "look" is informational. Log that the player sees the opponent's hand.
 *   - The UI handles showing the opponent's hand to the source player.
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card. If you do so, choose 1 card
 *   in the opponent's hand and discard it.
 *   - When triggered as an upgrade with AMBUSH, in addition to looking:
 *     1. The player must discard 1 card from their own hand (target selection).
 *     2. If they do, they then choose 1 card from the opponent's hand to discard (target selection).
 */
function handleSasuke014Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  let newState = { ...state };

  // Base AMBUSH: Look at opponent's hand
  newState = { ...newState, log: logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_LOOK',
    `Sasuke Uchiwa (014): Looks at ${opponentPlayer}'s hand.`,
    'game.log.effect.lookAtHand',
    { card: 'SASUKE UCHIWA', id: '014/130', target: opponentPlayer },
  ) };

  // If not an upgrade, just look
  if (!isUpgrade) {
    return { state: newState };
  }

  // UPGRADE addition: discard 1 card from own hand, then discard 1 from opponent's hand
  const playerState = newState[sourcePlayer];
  if (playerState.hand.length === 0) {
    // No cards to discard from own hand, upgrade portion fizzles
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (014): No cards in hand to discard (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: '014/130' }) } };
  }

  // Requires target selection: choose a card from own hand to discard
  const validTargets = playerState.hand.map((_, idx) => `hand_${idx}`);

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE_014_DISCARD_OWN',
    validTargets,
    description: 'Discard 1 card from your hand to then discard 1 card from the opponent\'s hand.',
  };
}

function handleSasuke014Upgrade(ctx: EffectContext): EffectResult {
  // The UPGRADE modifies the AMBUSH effect. When this card is played as an upgrade
  // and then its AMBUSH triggers, the AMBUSH handler checks ctx.isUpgrade.
  // This UPGRADE handler is a no-op since the logic is integrated into the AMBUSH handler.
  return { state: ctx.state };
}

export function registerSasuke014Handlers(): void {
  registerEffect('014/130', 'AMBUSH', handleSasuke014Ambush);
  registerEffect('014/130', 'UPGRADE', handleSasuke014Upgrade);
}
