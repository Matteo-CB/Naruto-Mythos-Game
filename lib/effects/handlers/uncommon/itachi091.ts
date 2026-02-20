import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 091/130 - ITACHI UCHIWA "Mangekyo Sharingan" (UC)
 * Chakra: 5 | Power: 4
 * Group: Akatsuki | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Look at opponent's hand.
 *   - Informational effect: the source player gets to see all cards in the
 *     opponent's hand. This is logged as an action.
 *   - No immediate game state change beyond logging.
 *
 * UPGRADE: MAIN: In addition to looking at opponent's hand, choose 1 card in
 *   opponent's hand and discard it.
 *   - When triggered as upgrade, after looking at the hand, the player must select
 *     one card from the opponent's hand to discard.
 *   - Requires target selection (hand card indices).
 */

function handleItachi091Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  // Log the look action
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_LOOK_HAND',
    `Itachi Uchiwa (091): Looked at opponent's hand (${opponentHand.length} cards).`,
    'game.log.effect.lookHand',
    { card: 'ITACHI UCHIWA', id: '091/130', count: String(opponentHand.length) },
  );

  const newState = { ...state, log };

  if (!isUpgrade) {
    // Base MAIN: just look, no further action
    return { state: newState };
  }

  // UPGRADE: In addition, choose 1 card from opponent's hand to discard
  if (opponentHand.length === 0) {
    const noTargetLog = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (091): Opponent has no cards in hand to discard (upgrade).',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: '091/130' },
    );
    return { state: { ...newState, log: noTargetLog } };
  }

  // If opponent has exactly 1 card, auto-discard it
  if (opponentHand.length === 1) {
    const discardedCard = opponentHand[0];
    const ps = { ...newState[opponentPlayer] };
    ps.hand = [];
    ps.discardPile = [...ps.discardPile, discardedCard];
    newState[opponentPlayer] = ps;

    const discardLog = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_DISCARD_FROM_HAND',
      `Itachi Uchiwa (091): Discarded ${discardedCard.name_fr} from opponent's hand (upgrade).`,
      'game.log.effect.discardFromHand',
      { card: 'ITACHI UCHIWA', id: '091/130', target: discardedCard.name_fr },
    );
    return { state: { ...newState, log: discardLog } };
  }

  // Multiple cards: requires target selection
  const validTargets = opponentHand.map((_, i) => String(i));

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'DISCARD_FROM_OPPONENT_HAND',
    validTargets,
    description: 'Itachi Uchiwa (091) UPGRADE: Select a card from opponent\'s hand to discard.',
  };
}

export function registerItachi091Handlers(): void {
  registerEffect('091/130', 'MAIN', handleItachi091Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to add the discard step
}
