import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 102/130 - MANDA (UC)
 * Chakra: 4 | Power: 6
 * Group: Independent | Keywords: Summon
 *
 * AMBUSH: Defeat an enemy character with keyword "Summon" in this mission.
 *
 * MAIN [hourglass]: At end of round, must return this character to hand.
 *
 * Confirmation popup before target selection (AMBUSH effects are optional).
 */

function handleManda102Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Pre-check: non-hidden enemy characters with keyword "Summon" in this mission?
  const hasSummon = enemyChars.some((char) => {
    if (char.isHidden) return false;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Summon');
  });

  if (!hasSummon) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Manda (102): No enemy character with keyword "Summon" in this mission.',
      'game.log.effect.noTarget',
      { card: 'MANDA', id: 'KS-102-UC' },
    );
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MANDA102_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.manda102ConfirmAmbush',
  };
}

function handleManda102Main(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Manda (102): Must return to hand at end of round (continuous).',
    'game.log.effect.continuous',
    { card: 'MANDA', id: 'KS-102-UC' },
  );
  return { state: { ...state, log } };
}

export function registerManda102Handlers(): void {
  registerEffect('KS-102-UC', 'AMBUSH', handleManda102Ambush);
  registerEffect('KS-102-UC', 'MAIN', handleManda102Main);
}
