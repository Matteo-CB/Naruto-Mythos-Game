import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 043/130 - GAI MAITO (UC)
 * Chakra: 5 | Power: 5
 * Group: Leaf Village | Keywords: Team Guy
 *
 * MAIN [continuous]: This character doesn't lose Power tokens at end of round.
 *   - This is a continuous/passive effect. The actual retention logic is handled
 *     in EndPhase.ts (removeAllPowerTokens checks for card number 43).
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: POWERUP 3 (self).
 *   - Add 3 power tokens to this character when played as an upgrade.
 */

function handleGai043Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - doesn't lose Power tokens at end of round.
  // This is passively checked in EndPhase removeAllPowerTokens.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Gai Maito (043): Power tokens will be retained at end of round (continuous).',
    'game.log.effect.continuous',
    { card: 'GAI MAITO', id: 'KS-043-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleGai043Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // Confirmation popup before POWERUP
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAI043_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.gai043ConfirmUpgrade',
  };
}

export function registerGai043Handlers(): void {
  registerEffect('KS-043-UC', 'MAIN', handleGai043Main);
  registerEffect('KS-043-UC', 'UPGRADE', handleGai043Upgrade);
}
