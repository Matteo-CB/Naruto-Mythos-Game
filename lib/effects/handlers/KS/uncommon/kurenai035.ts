import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 035/130 - YUHI KURENAI (UC)
 * Chakra: 4 | Power: 3
 * Group: Leaf Village | Keywords: Jutsu
 *
 * MAIN [continuous]: Characters cannot be moved from this mission.
 *   - This is a continuous/passive effect. The actual logic of blocking ALL
 *     character movement from this mission is handled in EffectEngine.ts
 *     moveCharToMissionDirect. The MAIN handler here is a no-op that logs activation.
 *
 * UPGRADE: Defeat an enemy character with Power 1 or less in this mission.
 *   - Find non-hidden enemy characters in this mission with effective power <= 1.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 */

function handleKurenai035Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - characters cannot be moved from this mission.
  // This is passively enforced in EffectEngine.ts moveCharToMissionDirect.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Yuhi Kurenai (035): Characters cannot be moved from this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'YUHI KURENAI', id: 'KS-035-UC' },
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

  // Find enemy characters with effective power <= 1 (hidden = power 0, valid targets)
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (getEffectivePower(state, char, opponentPlayer) <= 1) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Yuhi Kurenai (035): No enemy character with Power 1 or less in this mission.',
      'game.log.effect.noTarget', { card: 'YUHI KURENAI', id: 'KS-035-UC' }) } };
  }

  // Confirmation popup before defeat
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI035_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kurenai035ConfirmUpgrade',
  };
}

export function registerKurenai035Handlers(): void {
  registerEffect('KS-035-UC', 'MAIN', handleKurenai035Main);
  registerEffect('KS-035-UC', 'UPGRADE', handleKurenai035Upgrade);
}
