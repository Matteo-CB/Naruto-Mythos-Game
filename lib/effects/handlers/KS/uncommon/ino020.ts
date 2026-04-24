import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleIno020Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];
  const friendlyChars = mission[friendlySide];

  const costLimit = isUpgrade ? 3 : 2;

  
  const friendlyNames = new Set<string>();
  for (const fc of friendlyChars) {
    if (!fc.isHidden) friendlyNames.add(fc.card.name_fr.toUpperCase());
  }

  
  
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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
    targetSelectionType: 'INO020_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, isUpgrade }),
    descriptionKey: 'game.effect.desc.ino020ConfirmMain',
  };
}

function handleIno020UpgradeNoop(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-020-UC', 'MAIN', handleIno020Main);
  registerEffect('KS-020-UC', 'UPGRADE', handleIno020UpgradeNoop);
}
