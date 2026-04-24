import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleHaku089Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  
  
  const opponentDeckEmpty = state[opponentPlayer].deck.length === 0;
  const ownDeckEmpty = state[sourcePlayer].deck.length === 0;

  if (!isUpgrade && opponentDeckEmpty) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', "Haku (089): Opponent's deck is empty. Cannot discard.",
      'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
    return { state: { ...state, log } };
  }

  if (isUpgrade && opponentDeckEmpty && ownDeckEmpty) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Haku (089): Both decks are empty. Cannot discard.',
      'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HAKU089_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.haku089ConfirmMain',
  };
}

function handleHaku089UpgradeNoop(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerHaku089Handlers(): void {
  registerEffect('KS-089-UC', 'MAIN', handleHaku089Main);
  registerEffect('KS-089-UC', 'UPGRADE', handleHaku089UpgradeNoop);
}
