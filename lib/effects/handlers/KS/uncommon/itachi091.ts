import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 091/130 - ITACHI UCHIWA "Mangekyo Sharingan" (UC)
 * Chakra: 5 | Power: 5
 * Group: Akatsuki | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Look at all cards in the opponent's hand. (Mandatory)
 *
 * UPGRADE: In addition, choose 1 card from the opponent's hand and discard it.
 */

function handleItachi091Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (091): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
    );
    return { state: { ...state, log } };
  }

  // Show ALL opponent hand cards
  const allCards = opponentHand.map((c, i) => ({
    name_fr: c.name_fr,
    chakra: c.chakra ?? 0,
    power: c.power ?? 0,
    image_file: c.image_file,
    originalIndex: i,
  }));

  const newState = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_LOOK_HAND',
      'Itachi Uchiwa (091): Revealed all cards in opponent\'s hand.',
      'game.log.effect.itachi091Reveal',
      { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
    ),
  };

  // Show all opponent hand cards — confirm only
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI091_HAND_REVEAL',
    validTargets: ['confirm'],
    description: JSON.stringify({
      text: 'Itachi (091): Opponent\'s hand revealed.',
      cards: allCards,
      isUpgrade,
    }),
    descriptionKey: 'game.effect.desc.itachi091Reveal',
    isMandatory: true,
  };
}

export function registerItachi091Handlers(): void {
  registerEffect('KS-091-UC', 'MAIN', handleItachi091Main);
}
