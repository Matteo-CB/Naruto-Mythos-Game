import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isCopyableCharacter, isCopyableEffect } from '@/lib/effects/handlers/KS/shared/copyExclusions';


function handleKakashi016Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, isUpgrade } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const costLimit = isUpgrade ? Infinity : 4;

  
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!isCopyableCharacter(char)) continue;

      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.chakra > costLimit) continue;

      
      const hasInstantEffect = topCard.effects?.some(effect => {
        return isCopyableEffect(effect, { wasRevealed: ctx.wasRevealed, wasFirstCard: ctx.wasFirstCard, wasUpgrade: ctx.isUpgrade, copieur: ctx.sourceCard.card.id });
      });

      if (hasInstantEffect) {
        validTargets.push(char.instanceId);
      }
    }
  }

  
  if (validTargets.length === 0) {
    const limitStr = isUpgrade ? 'any cost' : 'cost 4 or less';
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kakashi Hatake (016): No enemy character (${limitStr}) with a copyable instant effect in play.`,
      'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-016-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI016_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, isUpgrade }),
    descriptionKey: 'game.effect.desc.kakashi016ConfirmMain',
  };
}

function handleKakashi016UpgradeNoop(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerKakashi016Handlers(): void {
  registerEffect('KS-016-UC', 'MAIN', handleKakashi016Main);
  registerEffect('KS-016-UC', 'UPGRADE', handleKakashi016UpgradeNoop);
}
