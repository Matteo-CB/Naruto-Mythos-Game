import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 078/130 - KANKURO "Puppet Master" (UC)
 * Chakra: 5 | Power: 4
 * Group: Sand Village | Keywords: Team Baki
 *
 * AMBUSH: Move any character with Power 4 or less in play (any mission, any player)
 *   to another mission.
 *   - Find all non-hidden characters across all missions with effective power <= 4 (excluding self).
 *   - Requires target selection: which character to move, then which mission to move them to.
 *   - Triggered only when Kankuro is revealed from hidden (AMBUSH).
 *
 * UPGRADE: Play a friendly character from hand while hidden, paying 1 less.
 *   - When played as upgrade, select a character from hand to play hidden on any mission.
 *   - Normal hidden cost is 1 chakra; paying 1 less means it's free (0 cost).
 *   - Requires target selection for which card to play and which mission to place it on.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleKankuro078Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all non-hidden characters with effective power <= 4 across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      // Exclude self
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      if (getEffectivePower(char) <= 4) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kankuro (078): No character with Power 4 or less in play to move.',
      'game.log.effect.noTarget',
      { card: 'KANKURO', id: '078/130' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_CHARACTER_POWER_4_OR_LESS',
    validTargets,
    description: 'Kankuro (078) AMBUSH: Select any character with Power 4 or less in play to move to another mission.',
  };
}

function handleKankuro078Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find characters in hand that could be played hidden
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kankuro (078): No characters in hand to play hidden.',
      'game.log.effect.noTarget',
      { card: 'KANKURO', id: '078/130' },
    );
    return { state: { ...state, log } };
  }

  // All hand cards are valid targets for hidden play (paying 1 less = free)
  const validTargets = playerState.hand.map((_, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'PLAY_HIDDEN_FROM_HAND_FREE',
    validTargets,
    description: 'Kankuro (078) UPGRADE: Select a character from your hand to play hidden on any mission (free, 1 less than normal hidden cost).',
  };
}

export function registerKankuro078Handlers(): void {
  registerEffect('078/130', 'AMBUSH', handleKankuro078Ambush);
  registerEffect('078/130', 'UPGRADE', handleKankuro078Upgrade);
}
