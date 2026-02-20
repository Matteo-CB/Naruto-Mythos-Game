import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 031/130 - HINATA HYUGA "Byakugan" (UC)
 * Chakra: 3 | Power: 2
 * Group: Leaf Village | Keywords: Team 8, Kekkei Genkai
 *
 * MAIN [hourglass]: When a non-hidden enemy character is played in this mission, gain 1 Chakra.
 *   - This is a continuous/passive effect. The actual logic of detecting when an enemy
 *     character is played in the same mission and granting 1 chakra should be handled
 *     by ContinuousEffects.ts (checked during the action phase when an opponent plays
 *     a character face-visible in this mission).
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *   - No UPGRADE effect.
 */

function handleHinata031Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - gain 1 chakra when enemy plays a non-hidden character
  // in this mission. This is passively checked in ContinuousEffects.ts.
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Hinata Hyuga (031): Byakugan active - gain 1 Chakra when a non-hidden enemy character is played in this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'HINATA HYUGA', id: '031/130' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('031/130', 'MAIN', handleHinata031Main);
}
