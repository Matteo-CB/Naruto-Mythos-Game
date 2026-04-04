import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 104/130 - TSUNADE (R)
 * Chakra: 5, Power: 6
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Spend any amount of additional Chakra. POWERUP X, where X is the
 *   amount of additional Chakra spent. Player chooses from 0..N.
 *
 * UPGRADE: POWERUP X (same X as MAIN — free, no additional chakra cost).
 *   The UPGRADE just doubles the MAIN bonus. If 0 was spent on MAIN, UPGRADE gives 0.
 */

function tsunade104MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];
  const maxChakra = playerState.chakra;

  if (maxChakra <= 0) {
    // No chakra to spend — MAIN gives 0 POWERUP, store 0 for UPGRADE
    const newState = { ...state };
    (newState as any)._tsunade104ChakraSpent = 0;
    return {
      state: {
        ...newState,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT',
          'Tsunade (104): No extra chakra to spend.',
          'game.log.effect.tsunade104Decline',
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
  const { state, sourcePlayer, sourceCard } = ctx;
  const mainSpent = (state as any)._tsunade104ChakraSpent ?? 0;

  if (mainSpent <= 0) {
    // MAIN spent 0 → UPGRADE gives 0
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT',
          'Tsunade (104) UPGRADE: No chakra was spent on MAIN, POWERUP 0.',
          'game.log.effect.tsunade104Decline',
          { card: 'TSUNADE', id: 'KS-104-R' },
        ),
      },
    };
  }

  // UPGRADE gives free POWERUP X (same X as MAIN) — no confirmation needed
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE104_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: false, // mandatory — always applies if X > 0
    description: `Tsunade (104) UPGRADE: POWERUP ${mainSpent} (matching MAIN).`,
    descriptionKey: 'game.effect.desc.tsunade104ConfirmUpgrade',
  };
}

export function registerTsunade104Handlers(): void {
  registerEffect('KS-104-R', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-R', 'UPGRADE', tsunade104UpgradeHandler);
  registerEffect('KS-104-MV', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-MV', 'UPGRADE', tsunade104UpgradeHandler);
}
