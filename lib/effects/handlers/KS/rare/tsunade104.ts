import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 104/130 - TSUNADE (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Spend any amount of additional Chakra. POWERUP X, where X is the
 *   amount of additional Chakra spent. Player chooses from 0..N.
 *
 * UPGRADE: POWERUP X (same logic).
 *
 * Confirmation popup before chakra choice (MAIN effects are optional).
 */

function tsunade104MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];
  const maxChakra = playerState.chakra;

  if (maxChakra <= 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Tsunade (104): No extra chakra to spend for POWERUP.',
          'game.log.effect.noTarget',
          { card: 'TSUNADE', id: 'KS-104-R' },
        ),
      },
    };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE104_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: `Tsunade (104) MAIN: Spend extra chakra for POWERUP X (max ${maxChakra}).`,
    descriptionKey: 'game.effect.desc.tsunade104ConfirmMain',
  };
}

function tsunade104UpgradeHandler(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}

export function registerTsunade104Handlers(): void {
  registerEffect('KS-104-R', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-R', 'UPGRADE', tsunade104UpgradeHandler);
  registerEffect('KS-104-MV', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-MV', 'UPGRADE', tsunade104UpgradeHandler);
}
