import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 035/130 - YUHI KURENAI (UC)
 * Chakra: 4 | Power: 3
 * Group: Leaf Village | Keywords: Jutsu
 *
 * MAIN [continuous]: Enemy characters cannot move from this mission.
 *   - This is a continuous/passive effect. The actual logic of blocking enemy
 *     character movement from this mission is handled in ContinuousEffects.ts
 *     and move validation. The MAIN handler here is a no-op that logs activation.
 *
 * UPGRADE: Defeat an enemy character with Power 1 or less in this mission.
 *   - Find non-hidden enemy characters in this mission with effective power <= 1.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 */

function getEffectivePower(char: import('../../../engine/types').CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleKurenai035Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - enemy characters cannot move from this mission.
  // This is passively enforced in ContinuousEffects.ts / move validation.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Yuhi Kurenai (035): Enemy characters cannot move from this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'YUHI KURENAI', id: '035/130' },
  );
  return { state: { ...ctx.state, log } };
}

function handleKurenai035Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];

  // Find non-hidden enemy characters with effective power <= 1
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) continue;
    if (getEffectivePower(char) <= 1) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Yuhi Kurenai (035): No enemy character with Power 1 or less in this mission.',
      'game.log.effect.noTarget', { card: 'YUHI KURENAI', id: '035/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    let newState = defeatEnemyCharacter(state, sourceMissionIndex, validTargets[0], sourcePlayer);
    newState = { ...newState, log: logAction(newState.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DEFEAT',
      'Yuhi Kurenai (035): Defeated an enemy character with Power 1 or less (upgrade).',
      'game.log.effect.defeat', { card: 'YUHI KURENAI', id: '035/130', target: '' }) };
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI_DEFEAT_LOW_POWER',
    validTargets,
    description: 'Select an enemy character with Power 1 or less in this mission to defeat.',
  };
}

export function registerKurenai035Handlers(): void {
  registerEffect('035/130', 'MAIN', handleKurenai035Main);
  registerEffect('035/130', 'UPGRADE', handleKurenai035Upgrade);
}
