import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

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
 * UPGRADE: Reveal a friendly hidden character paying 1 less than its reveal cost.
 *   - When played as upgrade, scan all missions for hidden friendly characters.
 *   - Player selects which hidden character to reveal.
 *   - Cost = max(0, card.chakra - 1). The MAIN + AMBUSH effects of the revealed card fire.
 */

function handleKankuro078Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all characters with effective power <= 4 across all missions (hidden = power 0, valid)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      // Self is a valid target (Power 4 = valid)
      if (getEffectivePower(state, char, char.controlledBy) <= 4) {
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
      { card: 'KANKURO', id: 'KS-078-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_CHARACTER_POWER_4_OR_LESS',
    validTargets,
    description: 'Kankuro (078) AMBUSH: Select any character with Power 4 or less in play to move to another mission.',
    descriptionKey: 'game.effect.desc.kankuro078MoveCharacter',
  };
}

function handleKankuro078Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all hidden friendly characters across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) {
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
      'Kankuro (078) UPGRADE: No hidden friendly characters in play to reveal.',
      'game.log.effect.noTarget',
      { card: 'KANKURO', id: 'KS-078-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO078_REVEAL_HIDDEN_REDUCED',
    validTargets,
    description: 'Kankuro (078) UPGRADE: Select a hidden friendly character to reveal, paying 1 less than its reveal cost.',
    descriptionKey: 'game.effect.desc.kankuro078RevealHidden',
    isOptional: true,
  };
}

export function registerKankuro078Handlers(): void {
  registerEffect('KS-078-UC', 'AMBUSH', handleKankuro078Ambush);
  registerEffect('KS-078-UC', 'UPGRADE', handleKankuro078Upgrade);
}
