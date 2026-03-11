import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';

/**
 * Card 045/130 - ANKO MITARASHI (UC)
 * Chakra: 4 | Power: 3
 * Group: Leaf Village | Keywords: Jutsu
 *
 * AMBUSH: Defeat a hidden enemy character in play (any mission).
 *   - Find all hidden enemy characters across all missions.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Defeat the target using defeatEnemyCharacter (respects replacement effects).
 */

function handleAnko045Ambush(ctx: EffectContext): EffectResult {
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
      'Anko Mitarashi (045): No hidden enemy character in play to defeat.',
      'game.log.effect.noTarget', { card: 'ANKO MITARASHI', id: 'KS-045-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ANKO045_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.anko045ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-045-UC', 'AMBUSH', handleAnko045Ambush);
}
