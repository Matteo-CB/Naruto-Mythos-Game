import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 112/130 - CHOJI AKIMICHI (R)
 * Also applies to 112/130 A (Rare Art variant)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 10
 *
 * MAIN: Discard a card from your hand. POWERUP X where X is the cost of the discarded card.
 *   - Player chooses which card to discard.
 *
 * UPGRADE: Repeat the MAIN effect (discard a second card and POWERUP again).
 *   - When isUpgrade is true, after the first discard/POWERUP, a second choice is prompted.
 */

function choji112MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Choji Akimichi (112): Hand is empty, cannot discard.',
      'game.log.effect.noTarget',
      { card: 'CHOJI AKIMICHI', id: '112/130' },
    );
    return { state: { ...state, log } };
  }

  const handIndices = playerState.hand.map((_, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: ctx.isUpgrade
      ? 'Choji Akimichi (112): Choose a card to discard for POWERUP (1st of 2).'
      : 'Choji Akimichi (112): Choose a card to discard for POWERUP.',
  };
}

function choji112UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  // The EffectEngine's chojiChooseDiscard() creates the second pending when isUpgrade is true.
  return { state: ctx.state };
}

export function registerChoji112Handlers(): void {
  registerEffect('112/130', 'MAIN', choji112MainHandler);
  registerEffect('112/130', 'UPGRADE', choji112UpgradeHandler);
}
