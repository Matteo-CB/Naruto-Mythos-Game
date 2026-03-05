import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 111/130 V - SHIKAMARU NARA (M)
 * Chakra: 6, Power: 5
 * Group: Leaf Village, Keywords: Team 10, Jutsu
 *
 * MAIN [continuous]: Opponent cannot play characters hidden in this mission.
 *   - Continuous no-op. The play restriction is enforced by the engine's
 *     action validation (ActionPhase / GameEngine.validatePlayHidden).
 *
 * UPGRADE: Hide an enemy with Power 3 or less in this mission.
 *   - When isUpgrade: find non-hidden enemies in this mission with effective
 *     power <= 3. Require target selection.
 */

function shikamaru150MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Log the continuous effect
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Shikamaru Nara (111 MV): Opponent cannot play characters hidden in this mission (continuous).',
      'game.log.effect.continuous',
      { card: 'SHIKAMARU NARA', id: 'KS-111-MV' },
    ),
  };

  // UPGRADE: Hide an enemy with Power 3 or less in this mission
  if (ctx.isUpgrade) {
    const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
    const enemySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

    const thisMission = state.activeMissions[ctx.sourceMissionIndex];
    const validTargets = thisMission[enemySide].filter(
      (c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 3,
    );

    if (validTargets.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shikamaru Nara (111 MV): No enemy with Power 3 or less in this mission to hide (upgrade).',
          'game.log.effect.noTarget',
          { card: 'SHIKAMARU NARA', id: 'KS-111-MV' },
        ),
      };
      return { state };
    }

    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SHIKAMARU150_CHOOSE_HIDE',
      validTargets: validTargets.map((c) => c.instanceId),
      description: 'Shikamaru Nara (111 MV): Choose an enemy with Power 3 or less in this mission to hide.',
      descriptionKey: 'game.effect.desc.shikamaru150HideEnemy',
    };
  }

  return { state };
}

function shikamaru150UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerShikamaru150Handlers(): void {
  registerEffect('KS-111-MV', 'MAIN', shikamaru150MainHandler);
  registerEffect('KS-111-MV', 'UPGRADE', shikamaru150UpgradeHandler);
}
