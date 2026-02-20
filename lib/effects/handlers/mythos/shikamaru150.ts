import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 150/130 - SHIKAMARU NARA (M)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 10
 *
 * MAIN [continuous]: Opponent cannot play characters hidden in this mission.
 *   - Continuous no-op. The play restriction is enforced by the engine's
 *     action validation (ActionPhase / GameEngine.validatePlayHidden).
 *
 * UPGRADE: Hide an enemy with Power 3 or less in this mission.
 *   - When isUpgrade: find non-hidden enemies in this mission with effective
 *     power <= 3. If multiple, require target selection. If one, auto-apply.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function shikamaru150MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Log the continuous effect
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Shikamaru Nara (150): Opponent cannot play characters hidden in this mission (continuous).',
      'game.log.effect.continuous',
      { card: 'SHIKAMARU NARA', id: '150/130' },
    ),
  };

  // UPGRADE: Hide an enemy with Power 3 or less in this mission
  if (ctx.isUpgrade) {
    const enemySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

    const thisMission = state.activeMissions[ctx.sourceMissionIndex];
    const validTargets = thisMission[enemySide].filter(
      (c) => !c.isHidden && getEffectivePower(c) <= 3,
    );

    if (validTargets.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shikamaru Nara (150): No enemy with Power 3 or less in this mission to hide (upgrade).',
          'game.log.effect.noTarget',
          { card: 'SHIKAMARU NARA', id: '150/130' },
        ),
      };
      return { state };
    }

    if (validTargets.length > 1) {
      return {
        state,
        requiresTargetSelection: true,
        targetSelectionType: 'SHIKAMARU150_CHOOSE_HIDE',
        validTargets: validTargets.map((c) => c.instanceId),
        description: 'Shikamaru Nara (150): Choose an enemy with Power 3 or less in this mission to hide.',
      };
    }

    // Auto-resolve: single target
    const target = validTargets[0];
    const missions = [...state.activeMissions];
    const mission = { ...missions[ctx.sourceMissionIndex] };
    const enemyChars = [...mission[enemySide]];
    const idx = enemyChars.findIndex((c) => c.instanceId === target.instanceId);

    if (idx !== -1) {
      enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
      mission[enemySide] = enemyChars;
      missions[ctx.sourceMissionIndex] = mission;

      state = {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_HIDE',
          `Shikamaru Nara (150): Hid enemy ${target.card.name_fr} in this mission (upgrade).`,
          'game.log.effect.hide',
          { card: 'SHIKAMARU NARA', id: '150/130', target: target.card.name_fr, mission: `mission ${ctx.sourceMissionIndex}` },
        ),
      };
    }
  }

  return { state };
}

function shikamaru150UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerShikamaru150Handlers(): void {
  registerEffect('150/130', 'MAIN', shikamaru150MainHandler);
  registerEffect('150/130', 'UPGRADE', shikamaru150UpgradeHandler);
}
