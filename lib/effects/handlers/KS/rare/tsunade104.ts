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
 */

function tsunade104MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
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

  // Build options: 0 through maxChakra (0 means decline)
  const validTargets: string[] = [];
  for (let i = 0; i <= maxChakra; i++) {
    validTargets.push(String(i));
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE104_CHOOSE_CHAKRA',
    validTargets,
    description: `Tsunade (104): Choose how much extra chakra to spend (0-${maxChakra}). POWERUP X.`,
    descriptionKey: 'game.effect.desc.tsunade104ChooseChakra',
    descriptionParams: { max: maxChakra },
  };
}

function tsunade104UpgradeHandler(ctx: EffectContext): EffectResult {
  // No-op: the MAIN handler already handles the "spend extra chakra for POWERUP"
  // logic. The UPGRADE effect text describes the same ability, not an additional one.
  return { state: ctx.state };
}

export function registerTsunade104Handlers(): void {
  registerEffect('KS-104-R', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-R', 'UPGRADE', tsunade104UpgradeHandler);
  registerEffect('KS-104-MV', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-MV', 'UPGRADE', tsunade104UpgradeHandler);
}
