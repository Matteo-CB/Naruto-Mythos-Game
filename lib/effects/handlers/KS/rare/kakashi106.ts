import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 106/130 - KAKASHI HATAKE (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard the top card of an upgraded enemy character's stack
 *   (remove the top card, revealing the previous card underneath).
 *
 * UPGRADE: MAIN effect: Also copy any non-Upgrade instant effect of the discarded card.
 *
 * Confirmation popup before target selection. Modifier pattern for UPGRADE.
 */

function kakashi106MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-check: any upgraded enemy characters across all missions?
  let hasUpgraded = false;
  for (const mission of state.activeMissions) {
    const enemyChars = mission[enemySide];
    for (const char of enemyChars) {
      if (char.stack?.length > 1) {
        hasUpgraded = true;
        break;
      }
    }
    if (hasUpgraded) break;
  }

  if (!hasUpgraded) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kakashi Hatake (106): No upgraded enemy characters to de-evolve.',
          'game.log.effect.noTarget',
          { card: 'KAKASHI HATAKE', id: 'KS-106-R' },
        ),
      },
    };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI106_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Kakashi Hatake (106) MAIN: De-evolve an upgraded enemy character.',
    descriptionKey: 'game.effect.desc.kakashi106ConfirmMain',
  };
}

function kakashi106UpgradeHandler(ctx: EffectContext): EffectResult {
  // No-op: modifier handled via CONFIRM_MAIN → CONFIRM_UPGRADE_MODIFIER in engine.
  return { state: ctx.state };
}

export function registerKakashi106Handlers(): void {
  registerEffect('KS-106-R', 'MAIN', kakashi106MainHandler);
  registerEffect('KS-106-R', 'UPGRADE', kakashi106UpgradeHandler);
}
