import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 073/130 - KIN TSUCHI "Bell Sound Clone" (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Sound Ninja, Jutsu
 *
 * MAIN: Discard a card from your hand to hide an enemy character with Power 4 or less.
 *   - Two-step process after CONFIRM:
 *     Step 1 (KIN073_CHOOSE_DISCARD): Player selects a card from hand to discard.
 *     Step 2 (KIN073_CHOOSE_ENEMY): Player selects a non-hidden enemy with power <= 4 to hide.
 *
 * UPGRADE: Put the top card of your deck as a hidden character in this mission.
 */

function handleKin073Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const playerState = state[sourcePlayer];

  // Check if player has cards in hand to discard (cost)
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  // Check that there is at least one valid enemy target IN THIS MISSION ONLY
  const thisMission = state.activeMissions[sourceMissionIndex];
  const enemyCharsHere = opponentPlayer === 'player1'
    ? thisMission.player1Characters
    : thisMission.player2Characters;
  const hasValidTarget = enemyCharsHere.some(
    (char) => canBeHiddenByEnemy(state, char, opponentPlayer) && getEffectivePower(state, char, opponentPlayer) <= 4,
  );

  if (!hasValidTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No non-hidden enemy with Power 4 or less in this mission.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kin073ConfirmMain',
  };
}

function handleKin073Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, effect fizzles
  if (playerState.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): Deck is empty, cannot place hidden character.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kin073ConfirmUpgrade',
  };
}

export function registerKin073Handlers(): void {
  registerEffect('KS-073-UC', 'MAIN', handleKin073Main);
  registerEffect('KS-073-UC', 'UPGRADE', handleKin073Upgrade);
}
