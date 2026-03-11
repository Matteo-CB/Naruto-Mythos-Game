import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 093/130 - KISAME HOSHIGAKI "Samehada" (UC)
 * Chakra: 6 | Power: 6
 * Group: Akatsuki | Keywords: Rogue Ninja, Weapon
 *
 * MAIN: Remove up to 2 Power tokens from an enemy character in play and put them
 * on this character.
 *
 * UPGRADE: MAIN effect: Instead, remove ALL Power tokens and put them on this character.
 *
 * Confirmation popup before target selection. Modifier pattern for UPGRADE.
 */

function handleKisame093Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Pre-check: any enemy with power tokens across all missions?
  let hasTokenTarget = false;
  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of enemyChars) {
      if (char.powerTokens > 0) {
        hasTokenTarget = true;
        break;
      }
    }
    if (hasTokenTarget) break;
  }

  if (!hasTokenTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (093): No enemy with Power tokens in play.',
      'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-093-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KISAME093_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Kisame Hoshigaki (093) MAIN: Steal Power tokens from an enemy in play.',
    descriptionKey: 'game.effect.desc.kisame093ConfirmMain',
  };
}

function handleKisame093UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: modifier handled via CONFIRM_MAIN → CONFIRM_UPGRADE_MODIFIER in engine.
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-093-UC', 'MAIN', handleKisame093Main);
  registerEffect('KS-093-UC', 'UPGRADE', handleKisame093UpgradeNoop);
}
