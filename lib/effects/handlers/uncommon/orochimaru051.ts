import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 051/130 - OROCHIMARU (UC)
 * Chakra: 6 | Power: 5
 * Group: Sound Village | Keywords: Sannin
 *
 * MAIN [continuous]: If you lost this mission in Mission Phase, move this character
 * to another mission.
 *   - This is a continuous/passive effect. The actual logic of detecting mission loss
 *     and triggering the move is handled by ContinuousEffects.ts / MissionPhase.ts.
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: Defeat a hidden enemy character in play (any mission).
 *   - Find all hidden enemy characters across all missions.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Defeat the target.
 */

function handleOrochimaru051Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - if you lost this mission, move to another mission.
  // This is passively handled in MissionPhase.ts / ContinuousEffects.ts.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Orochimaru (051): If this mission is lost, this character will move to another mission (continuous).',
    'game.log.effect.continuous',
    { card: 'OROCHIMARU', id: 'KS-051-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleOrochimaru051Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all hidden enemy characters across all missions
  const validTargets: string[] = [];
  const targetMissionMap: Record<string, number> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
        targetMissionMap[char.instanceId] = i;
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Orochimaru (051): No hidden enemy character in play to defeat.',
      'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-051-UC' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU051_DEFEAT_HIDDEN',
    validTargets,
    description: 'Select a hidden enemy character in play to defeat.',
    descriptionKey: 'game.effect.desc.orochimaru051DefeatHidden',
  };
}

export function registerOrochimaru051Handlers(): void {
  registerEffect('KS-051-UC', 'MAIN', handleOrochimaru051Main);
  registerEffect('KS-051-UC', 'UPGRADE', handleOrochimaru051Upgrade);
}
