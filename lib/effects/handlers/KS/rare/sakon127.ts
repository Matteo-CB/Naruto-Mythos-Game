import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 127/130 - SAKON (R/RA)
 * Chakra: 5 | Power: 5
 * Group: Sound Village | Keywords: Sound Four, Jutsu
 *
 * MAIN [⧗]: Each enemy character in this mission has -1 Power.
 *   → Continuous effect — implemented in ContinuousEffects.ts via calculateContinuousPowerModifier().
 *
 * UPGRADE: Move a friendly character in play to another mission.
 *   → On upgrade: choose any friendly character in play, then choose destination mission.
 */

function sakon127UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Valid targets: all friendly characters in play (not self)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sakon (127) UPGRADE: No friendly character in play to move.',
          'game.log.effect.noTarget',
          { card: 'SAKON', id: 'KS-127-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON127_MOVE_FRIENDLY',
    validTargets,
    description: 'Sakon (127) UPGRADE: Choose a friendly character in play to move to another mission.',
    descriptionKey: 'game.effect.desc.sakon127MoveFriendly',
  };
}

export function registerSakon127Handlers(): void {
  registerEffect('KS-127-R', 'UPGRADE', sakon127UpgradeHandler);
  registerEffect('KS-127-RA', 'UPGRADE', sakon127UpgradeHandler);
  // MAIN [⧗] is a continuous effect handled in ContinuousEffects.ts
}
