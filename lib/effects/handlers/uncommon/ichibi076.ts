import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 076/130 - ICHIBI "Shukaku" (UC)
 * Chakra: 6 | Power: 8
 * Group: Sand Village | Keywords: Summon, Tailed Beast
 *
 * MAIN [hourglass]: Can be played as upgrade over any character named "Gaara"
 *   (regardless of normal cost difference rules for upgrades).
 *   - This is a special upgrade rule. The engine must allow upgrading any "Gaara"
 *     with this card even if the chakra cost difference rule would not normally permit it.
 *   - The handler is a no-op; the engine handles this in upgrade validation.
 *
 * MAIN [hourglass]: Can't be hidden or defeated by enemy effects.
 *   - This is a continuous immunity effect. While Ichibi is face-visible, enemy effects
 *     cannot hide or defeat it.
 *   - The handler is a no-op; the engine handles this in defeatUtils and hide checks.
 */

function handleIchibi076Main(ctx: EffectContext): EffectResult {
  // Both effects are continuous [hourglass]:
  // 1. Can upgrade any Gaara (engine handles in upgrade validation)
  // 2. Immune to enemy hide/defeat effects (engine handles in defeatUtils / effect resolution)
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Ichibi (076): Can upgrade any Gaara. Immune to enemy hide/defeat effects (continuous).',
    'game.log.effect.continuous',
    { card: 'ICHIBI', id: '076/130' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('076/130', 'MAIN', handleIchibi076Main);
}
