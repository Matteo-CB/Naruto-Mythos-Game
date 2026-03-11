import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 111/130 - SHIKAMARU NARA (R)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 10
 *
 * MAIN [continuous]: Opponent cannot play characters hidden in this mission.
 *   This is a continuous play restriction effect. The handler is a no-op;
 *   the engine handles the play restriction in the action validation layer.
 *
 * UPGRADE: Hide an enemy character with Power 3 or less in this mission.
 *
 * Confirmation popup before target selection.
 */

function shikamaru111MainHandler(ctx: EffectContext): EffectResult {
  // Continuous play restriction - handled by the engine's action validation.
  // No-op handler to register the card.
  return { state: ctx.state };
}

function shikamaru111UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Pre-check: non-hidden enemies with effective power <= 3 that can be hidden
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => canBeHiddenByEnemy(state, c, opponentPlayer) && getEffectivePower(state, c, opponentPlayer) <= 3)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shikamaru Nara (111) UPGRADE: No enemy character with Power 3 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'SHIKAMARU NARA', id: 'KS-111-R' },
        ),
      },
    };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU111_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.shikamaru111ConfirmUpgrade',
  };
}

export function registerShikamaru111Handlers(): void {
  registerEffect('KS-111-R', 'MAIN', shikamaru111MainHandler);
  registerEffect('KS-111-R', 'UPGRADE', shikamaru111UpgradeHandler);
}
