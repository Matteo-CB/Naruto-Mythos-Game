import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';

/**
 * Card 026/130 - KIBA INUZUKA "Ninpo ! La Danse du Chien !" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN: Hide the non-hidden enemy character with the lowest cost in this mission.
 *   - If multiple enemies are tied for the lowest cost, the KIBA PLAYER chooses which to hide.
 *
 * UPGRADE: Look at the 3 top cards of your deck, reveal and draw any Akamaru characters,
 *   then put back the other cards on top of the deck.
 */
function handleKiba026Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;

  const newState = { ...state };

  const mission = newState.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find non-hidden enemies that can be hidden by enemy effects
  const nonHiddenEnemies = enemyChars.filter(c => canBeHiddenByEnemy(newState, c, opponentPlayer));

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kiba Inuzuka (026): No non-hidden enemy character in this mission to hide.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

  // Confirmation popup before hiding
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA026_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kiba026ConfirmMain',
  };
}

function handleKiba026Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  let newState = { ...state };
  const ps = { ...newState[sourcePlayer] };

  if (ps.deck.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT', 'Kiba Inuzuka (026): Deck is empty, upgrade effect fizzles.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

  // Confirmation popup before peeking at deck
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA026_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kiba026ConfirmUpgrade',
  };
}

export function registerKiba026Handlers(): void {
  registerEffect('KS-026-UC', 'MAIN', handleKiba026Main);
  registerEffect('KS-026-UC', 'UPGRADE', handleKiba026Upgrade);
}
