import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 145/130 - NARUTO UZUMAKI (M)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN [continuous]: If you have the Edge token, your hidden characters in this
 *                    mission have +1 Power.
 *   - Continuous no-op. The power modifier is handled by the engine during scoring
 *     (ContinuousEffects / MissionPhase power calculation).
 *   - When the controlling player holds the Edge token, all their hidden characters
 *     assigned to the same mission as Naruto 145 gain +1 effective power.
 */

function naruto145MainHandler(ctx: EffectContext): EffectResult {
  // Continuous power modifier - handled by engine's scoring and ContinuousEffects
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Naruto Uzumaki (145): Hidden characters in this mission gain +1 Power while you hold the Edge token (continuous).',
    'game.log.effect.continuous',
    { card: 'NARUTO UZUMAKI', id: 'KS-145-M' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-145-M', 'MAIN', naruto145MainHandler);
}
