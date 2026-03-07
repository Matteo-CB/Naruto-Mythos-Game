import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 020/130 - INO YAMANAKA 'Transposition' (UC)
 * Chakra: 3 | Power: 0
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * MAIN: Take control of an enemy character with cost 2 or less in this mission.
 * UPGRADE: MAIN effect: Instead, the cost limit is 3 or less.
 */

function handleIno020Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];
  const friendlyChars = mission[friendlySide];

  const costLimit = isUpgrade ? 3 : 2;

  // Collect visible friendly character names for same-name pre-filter
  const friendlyNames = new Set<string>();
  for (const fc of friendlyChars) {
    if (!fc.isHidden) friendlyNames.add(fc.card.name_fr.toUpperCase());
  }

  // Find enemy characters with cost <= costLimit (hidden characters have cost 0 per rules)
  // Pre-filter: exclude targets that would create a same-name duplicate on our side
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    const effectiveCost = char.isHidden ? 0 : topCard.chakra;
    if (effectiveCost <= costLimit) {
      if (!char.isHidden && friendlyNames.has(char.card.name_fr.toUpperCase())) {
        continue;
      }
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const limitStr = isUpgrade ? '3' : '2';
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ino Yamanaka (020): No enemy character with cost ' + limitStr + ' or less in this mission to take control of.') },
    descriptionKey: 'game.effect.desc.ino020TakeControl',
    descriptionParams: { costLimit: limitStr },
  };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    validTargets,
    isOptional: true,
    descriptionKey: 'game.effect.desc.ino020TakeControl',
    descriptionParams: { costLimit: String(costLimit) },
  };
}

function handleIno020UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: MAIN handler already checks isUpgrade to increase cost limit from 2 to 3.
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-020-UC', 'MAIN', handleIno020Main);
  registerEffect('KS-020-UC', 'UPGRADE', handleIno020UpgradeNoop);
}
