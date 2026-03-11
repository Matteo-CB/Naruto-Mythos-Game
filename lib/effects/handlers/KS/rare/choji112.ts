import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 112/130 - CHOJI AKIMICHI (R)
 * Also applies to 112/130 A (Rare Art variant)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 10
 *
 * MAIN: Discard a card from your hand. POWERUP X where X is the cost of the discarded card.
 *
 * UPGRADE: Repeat the MAIN effect (discard a second card and POWERUP again).
 *
 * Confirmation popup before discard selection.
 */

function choji112MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Choji Akimichi (112): Hand is empty, cannot discard.',
      'game.log.effect.noTarget',
      { card: 'CHOJI AKIMICHI', id: 'KS-112-R' },
    );
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI112_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Choji Akimichi (112) MAIN: Discard a card from hand. POWERUP X (X = cost).',
    descriptionKey: 'game.effect.desc.choji112ConfirmMain',
  };
}

function choji112UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE repeat handled by EffectEngine's CHOJI_CHOOSE_DISCARD case.
  return { state: ctx.state };
}

export function registerChoji112Handlers(): void {
  registerEffect('KS-112-R', 'MAIN', choji112MainHandler);
  registerEffect('KS-112-R', 'UPGRADE', choji112UpgradeHandler);
}
