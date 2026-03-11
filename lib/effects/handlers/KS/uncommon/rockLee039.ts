import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 039/130 - ROCK LEE - "La Fleur du Lotus Recto" (UC)
 * Chakra: 4, Power: 4
 * Group: Leaf Village, Keywords: Team Guy
 *
 * MAIN [hourglass]: This character doesn't lose Power tokens at the end of the round.
 *   - This is a continuous/passive effect. The actual retention logic is handled
 *     in EndPhase.ts (removeAllPowerTokens checks for card number 39).
 *     The MAIN handler here is a no-op since the effect is passive.
 *
 * UPGRADE: POWERUP 2.
 *   - Add 2 power tokens to this character when played as an upgrade.
 */

function rockLeeMainHandler(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - doesn't lose Power tokens at end of round.
  // This is passively checked in EndPhase removeAllPowerTokens.
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Rock Lee: Power tokens will be retained at end of round (continuous).',
    'game.log.effect.powerupSelf', { card: 'ROCK LEE', id: 'KS-039-UC', amount: 0 },
  );
  return { state: { ...state, log } };
}

function rockLeeUpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // Confirmation popup before POWERUP
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ROCKLEE039_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.rockLee039ConfirmUpgrade',
  };
}

export function registerRockLee039Handlers(): void {
  registerEffect('KS-039-UC', 'MAIN', rockLeeMainHandler);
  registerEffect('KS-039-UC', 'UPGRADE', rockLeeUpgradeHandler);
}
